import os
import asyncio
import httpx
from pydantic import BaseModel

MAX_RETRIES = 3
INITIAL_BACKOFF = 5  # seconds

async def generate_pinescript(strategy_rules: dict, symbol: str) -> str:
    """Uses Groq Llama 3 to translate parsed strategy rules into TradingView PineScript v5."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")

    system_prompt = """You are a PineScript v5 expert. Strictly translate this JSON strategy into a valid TradingView Strategy script. 
Use strategy.entry and strategy.close logic. Include adjustable inputs for all indicator lengths. Output ONLY the code.
Do NOT use markdown code blocks (```pinescript ... ```) in your output, just the raw code.

The code MUST follow this skeleton exactly at the beginning:
// © 2024 AI_Agent_Backtester - Astra.AI
//@version=5
strategy("AI Generated Strategy", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_value=0.1, slippage=0.05)

[INSERT LLM GENERATED LOGIC HERE]"""

    prompt = f"Convert this strategy into PineScript v5 for symbol {symbol}:\n{strategy_rules}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 2048
                    },
                )
                response.raise_for_status()
                break  # Success — exit the retry loop
            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code == 429 and attempt < MAX_RETRIES - 1:
                    wait = INITIAL_BACKOFF * (2 ** attempt)  # 5s, 10s, 20s
                    print(f"[PineScript] Rate limited (429). Retrying in {wait}s... (attempt {attempt + 1}/{MAX_RETRIES})")
                    await asyncio.sleep(wait)
                    continue
                print(f"[PineScript] Groq API error: {e.response.status_code} - {e.response.text}")
                raise
            except httpx.TimeoutException:
                print("[PineScript] Groq API request timed out (60s)")
                raise ValueError("Groq API request timed out. Please try again.")
        else:
            # All retries exhausted
            raise last_error  # type: ignore

        data = response.json()
        code = data["choices"][0]["message"]["content"].strip()
        
        # Strip markdown code blocks if the LLM adds them despite instructions
        if code.startswith("```"):
            lines = code.split("\n")
            if len(lines) > 2:
                # remove first line (e.g., ```pine or ```pinescript) and last line (```)
                code = "\n".join(lines[1:-1]).strip()
                
        return code
