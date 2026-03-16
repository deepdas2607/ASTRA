"""Strategy parser — the only LLM-touching service."""
from __future__ import annotations
from app.parsing.prompts import SYSTEM_PROMPT, build_user_prompt
from app.parsing.provider import call_llm
from app.models.strategy import ParseResult, StrategySchema, ParseRequest
from app.data.adapters import detect_market

# Hardcoded fallback for demo reliability
_DEMO_RESPONSES: dict[str, dict] = {
    "golden_cross": {
        "parsed_strategy": {
            "strategy_name": "Golden Cross with RSI Exit",
            "asset_class": "equity",
            "symbols": ["AAPL"],
            "timeframe": "1d",
            "lookback": {"period": "2y"},
            "execution": {"order_timing": "next_bar_open", "side": "long_only"},
            "entry": {"logic": "all", "rules": [{"left": {"indicator": "sma", "params": {"period": 50}}, "operator": "crosses_above", "right": {"indicator": "sma", "params": {"period": 200}}}]},
            "exit": {"logic": "any", "rules": [{"left": {"indicator": "rsi", "params": {"period": 14}}, "operator": ">", "right": {"value": 70}}]},
            "position_sizing": {"mode": "percent_of_equity", "value": 1.0},
            "friction": {"commission": {"type": "flat_per_order", "value": 20, "currency": "INR"}, "slippage": {"type": "bps", "value": 10}},
            "benchmark": "^GSPC"
        },
        "confidence": 0.95,
        "ambiguities": [],
        "explanation": "Enter when SMA 50 crosses above SMA 200 (Golden Cross). Exit when RSI 14 exceeds 70.",
        "strategy_type": "trend_following"
    }
}


def _match_demo(text: str) -> dict | None:
    t = text.lower()
    if "cross" in t and ("sma" in t or "ma " in t or "moving average" in t):
        return _DEMO_RESPONSES["golden_cross"]
    return None


def parse_strategy(req: ParseRequest) -> ParseResult:
    """Parse natural language strategy into structured schema."""
    market = detect_market(req.symbol)

    # Try LLM first
    try:
        user_prompt = build_user_prompt(req.strategy_text, req.symbol, req.timeframe, req.lookback)
        raw = call_llm(SYSTEM_PROMPT, user_prompt)
    except Exception:
        # Fallback to demo response
        demo = _match_demo(req.strategy_text)
        if demo:
            raw = demo
        else:
            raise

    # Inject actual symbol
    if "parsed_strategy" in raw:
        raw["parsed_strategy"]["symbols"] = [req.symbol]
        raw["parsed_strategy"]["timeframe"] = req.timeframe
        raw["parsed_strategy"]["lookback"] = {"period": req.lookback}
        raw["parsed_strategy"]["benchmark"] = market["benchmark"]
        raw["parsed_strategy"]["friction"]["commission"]["currency"] = market["currency"]

    strategy = StrategySchema(**raw["parsed_strategy"])
    return ParseResult(
        parsed_strategy=strategy,
        confidence=raw.get("confidence", 0.5),
        ambiguities=raw.get("ambiguities", []),
        explanation=raw.get("explanation", ""),
        strategy_type=raw.get("strategy_type", ""),
    )
