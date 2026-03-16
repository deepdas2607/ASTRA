"""Intent classifier for incoming WhatsApp messages."""
from __future__ import annotations
from groq import Groq
from app.core.config import settings


INTENT_SYSTEM_PROMPT = """\
You are a message classifier for the Astra trading platform. Classify the user's WhatsApp message into one of these intents:

1. **backtest** — The user wants to test a specific strategy they described. They mention specific indicators, rules, or trading conditions.
   Examples: "Buy when RSI drops below 30, sell when above 70", "Test golden cross on AAPL", "Run a MACD crossover strategy"

2. **generate** — The user wants the AI to create/design a strategy for them. They describe goals but not specific rules.
   Examples: "Make me a strategy that maximizes returns", "Generate a low-drawdown strategy", "What strategy works best for Tesla?"

3. **chat** — General questions, greetings, or trading discussions that don't require running a pipeline.
   Examples: "What is Sharpe ratio?", "Hello", "Explain bollinger bands", "Thanks"

Respond with ONLY a JSON object: {"intent": "backtest"|"generate"|"chat", "strategy_text": "...", "goal": "...", "symbol": "...", "lookback": "..."}
- strategy_text: Extract the strategy description (for backtest intent only)
- goal: Extract the trading goal (for generate intent only)
- symbol: Extract ticker if mentioned, default "AAPL"
- lookback: Extract timeframe if mentioned, default "2y"
"""


def classify_intent(message: str) -> dict:
    """Classify a WhatsApp message into an intent with extracted parameters.

    Returns:
        {"intent": "backtest"|"generate"|"chat", "strategy_text": "", "goal": "", "symbol": "AAPL", "lookback": "2y"}
    """
    client = Groq(api_key=settings.GROQ_API_KEY)

    response = client.chat.completions.create(
        model=settings.LLM_FALLBACK_MODEL,  # Use fast model for classification
        messages=[
            {"role": "system", "content": INTENT_SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.0,
        max_tokens=200,
        response_format={"type": "json_object"},
    )

    import json
    text = response.choices[0].message.content or "{}"
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {}

    return {
        "intent": result.get("intent", "chat"),
        "strategy_text": result.get("strategy_text", message),
        "goal": result.get("goal", message),
        "symbol": result.get("symbol", "AAPL"),
        "lookback": result.get("lookback", "2y"),
    }
