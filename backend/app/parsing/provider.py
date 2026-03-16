"""LLM provider with fallback chain."""
from __future__ import annotations
import json
import re
import time
from groq import Groq
from app.core.config import settings


def _extract_json(text: str) -> dict | None:
    """Attempt to extract JSON from LLM response text."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try regex extraction
    patterns = [
        r"```json\s*(.*?)\s*```",
        r"```\s*(.*?)\s*```",
        r"(\{.*\})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    return None


def call_llm(system_prompt: str, user_prompt: str) -> dict:
    """Call Groq LLM with fallback chain.

    Fallback order:
    1. Primary model (llama-3.3-70b-versatile)
    2. Lighter model (llama-3.1-8b-instant)
    3. Raises error if both fail
    """
    models = [settings.LLM_PRIMARY_MODEL, settings.LLM_FALLBACK_MODEL]
    client = Groq(api_key=settings.GROQ_API_KEY)
    last_error = None

    for model in models:
        for attempt in range(2):  # max 2 attempts per model
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=settings.LLM_TEMPERATURE,
                    max_tokens=settings.LLM_MAX_TOKENS,
                    response_format={"type": "json_object"},
                )
                text = response.choices[0].message.content or ""
                result = _extract_json(text)
                if result is not None:
                    return result
                # Retry with stricter prompt on malformed output
                if attempt == 0:
                    user_prompt += "\n\nIMPORTANT: Return ONLY raw JSON. No markdown. No extra text."
                    continue
            except Exception as e:
                last_error = e
                if "429" in str(e):
                    time.sleep(2 ** attempt)
                    continue
                break

    raise RuntimeError(f"All LLM models failed. Last error: {last_error}")
