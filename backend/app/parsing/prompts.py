"""LLM prompts for the parser agent."""

SYSTEM_PROMPT = """You are a trading strategy parser. Convert the user's natural language trading strategy into a strict JSON schema.

RULES:
- Only use indicators from this list: sma, ema, rsi, macd, macd_signal, macd_histogram, bollinger_upper, bollinger_lower, bollinger_mid, vwap, close, open, high, low, volume
- Only use operators from this list: >, <, >=, <=, ==, crosses_above, crosses_below
- Output ONLY valid JSON matching the schema below. No markdown, no explanation outside the JSON.
- If information is missing, use these defaults and note them in ambiguities:
  - RSI period: 14
  - MACD: fast=12, slow=26, signal=9
  - Bollinger: period=20, std=2
  - Timeframe: 1d
  - Lookback: 2y
  - Order timing: next_bar_open
  - Side: long_only
  - Position sizing: percent_of_equity, value 1.0
- Include a human-readable explanation of the parsed strategy.
- Return a confidence score between 0.0 and 1.0.
- Classify the strategy_type as one of: trend_following, mean_reversion, momentum, breakout, hybrid
- Do NOT generate any Python code, executable logic, or anything outside the JSON schema.

OUTPUT SCHEMA:
{
  "parsed_strategy": {
    "strategy_name": "string",
    "asset_class": "equity|crypto",
    "symbols": ["string"],
    "timeframe": "1d",
    "lookback": {"period": "2y"},
    "execution": {"order_timing": "next_bar_open", "side": "long_only"},
    "entry": {
      "logic": "all|any",
      "rules": [
        {
          "left": {"indicator": "sma", "params": {"period": 50}},
          "operator": "crosses_above",
          "right": {"indicator": "sma", "params": {"period": 200}}
        }
      ]
    },
    "exit": {
      "logic": "any",
      "rules": [
        {
          "left": {"indicator": "rsi", "params": {"period": 14}},
          "operator": ">",
          "right": {"value": 70}
        }
      ]
    },
    "position_sizing": {"mode": "percent_of_equity", "value": 1.0},
    "friction": {
      "commission": {"type": "flat_per_order", "value": 20, "currency": "INR"},
      "slippage": {"type": "bps", "value": 10}
    },
    "benchmark": "^GSPC"
  },
  "confidence": 0.91,
  "ambiguities": ["RSI period not specified, defaulted to 14"],
  "explanation": "Enter when SMA 50 crosses above SMA 200. Exit when RSI 14 exceeds 70.",
  "strategy_type": "trend_following"
}"""


FEW_SHOT_EXAMPLES = [
    {
        "input": "Buy when 50 SMA crosses above 200 SMA, sell when RSI exceeds 70",
        "output": {
            "parsed_strategy": {
                "strategy_name": "Golden Cross with RSI Exit",
                "asset_class": "equity",
                "symbols": ["AAPL"],
                "timeframe": "1d",
                "lookback": {"period": "2y"},
                "execution": {"order_timing": "next_bar_open", "side": "long_only"},
                "entry": {
                    "logic": "all",
                    "rules": [{
                        "left": {"indicator": "sma", "params": {"period": 50}},
                        "operator": "crosses_above",
                        "right": {"indicator": "sma", "params": {"period": 200}}
                    }]
                },
                "exit": {
                    "logic": "any",
                    "rules": [{
                        "left": {"indicator": "rsi", "params": {"period": 14}},
                        "operator": ">",
                        "right": {"value": 70}
                    }]
                },
                "position_sizing": {"mode": "percent_of_equity", "value": 1.0},
                "friction": {"commission": {"type": "flat_per_order", "value": 20, "currency": "INR"}, "slippage": {"type": "bps", "value": 10}},
                "benchmark": "^GSPC"
            },
            "confidence": 0.95,
            "ambiguities": ["RSI period not specified, defaulted to 14"],
            "explanation": "Enter when SMA 50 crosses above SMA 200 (Golden Cross). Exit when RSI 14 exceeds 70 (overbought).",
            "strategy_type": "trend_following"
        }
    },
    {
        "input": "Buy when RSI drops below 30, sell when RSI goes above 70",
        "output": {
            "parsed_strategy": {
                "strategy_name": "RSI Mean Reversion",
                "asset_class": "equity",
                "symbols": ["AAPL"],
                "timeframe": "1d",
                "lookback": {"period": "2y"},
                "execution": {"order_timing": "next_bar_open", "side": "long_only"},
                "entry": {
                    "logic": "all",
                    "rules": [{
                        "left": {"indicator": "rsi", "params": {"period": 14}},
                        "operator": "<",
                        "right": {"value": 30}
                    }]
                },
                "exit": {
                    "logic": "any",
                    "rules": [{
                        "left": {"indicator": "rsi", "params": {"period": 14}},
                        "operator": ">",
                        "right": {"value": 70}
                    }]
                },
                "position_sizing": {"mode": "percent_of_equity", "value": 1.0},
                "friction": {"commission": {"type": "flat_per_order", "value": 20, "currency": "INR"}, "slippage": {"type": "bps", "value": 10}},
                "benchmark": "^GSPC"
            },
            "confidence": 0.97,
            "ambiguities": ["RSI period not specified, defaulted to 14"],
            "explanation": "Enter when RSI 14 drops below 30 (oversold). Exit when RSI 14 goes above 70 (overbought).",
            "strategy_type": "mean_reversion"
        }
    }
]


def build_user_prompt(strategy_text: str, symbol: str, timeframe: str, lookback: str) -> str:
    """Build the user message with strategy and context."""
    import json
    examples = "\n\n".join([
        f'Example input: "{ex["input"]}"\nExample output:\n{json.dumps(ex["output"], indent=2)}'
        for ex in FEW_SHOT_EXAMPLES
    ])

    return f"""{examples}

Now parse this strategy:

Strategy: "{strategy_text}"
Symbol: {symbol}
Timeframe: {timeframe}
Lookback: {lookback}

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON."""
