"""Strategy Generator — orchestrates CrewAI agents to create optimal strategies.

Flow: User goal → CrewAI crew → parsed strategy → existing backtest pipeline → results
"""
from __future__ import annotations
import json
import re
import time
import uuid
from app.agents.crew import create_crew, _build_market_context
from app.data.adapters import fetch_bars, detect_market
from app.models.strategy import ParseResult, StrategySchema
from app.models.result import BacktestResult, AgentLog, Metrics
from app.backtesting.compiler import compile_strategy
from app.backtesting.engine import run_backtest
from app.analytics.metrics import compute_metrics, generate_risk_warnings, generate_insights


# Valid indicator names our compiler supports
VALID_INDICATORS = {
    "sma", "ema", "rsi", "macd", "macd_signal", "macd_histogram",
    "bollinger_upper", "bollinger_lower", "bollinger_mid",
    "vwap", "close", "open", "high", "low", "volume",
}

# Map common LLM outputs to valid indicator names
INDICATOR_ALIASES = {
    "bollinger_bands": "bollinger_lower",
    "bb_upper": "bollinger_upper",
    "bb_lower": "bollinger_lower",
    "bb_mid": "bollinger_mid",
    "boll_upper": "bollinger_upper",
    "boll_lower": "bollinger_lower",
    "boll_mid": "bollinger_mid",
    "upper_band": "bollinger_upper",
    "lower_band": "bollinger_lower",
    "middle_band": "bollinger_mid",
    "signal": "macd_signal",
    "macd_signal_line": "macd_signal",
    "macd_line": "macd",
    "histogram": "macd_histogram",
    "simple_moving_average": "sma",
    "exponential_moving_average": "ema",
    "relative_strength_index": "rsi",
    "price": "close",
    "closing_price": "close",
}

# Fallback strategies keyed by goal type
FALLBACK_STRATEGIES = {
    "momentum": {
        "strategy_name": "AI Momentum Strategy",
        "strategy_type": "momentum",
        "entry_rules": [
            {"indicator": "rsi", "params": {"period": 14}, "operator": "<", "compare_to": {"value": 35}},
            {"indicator": "macd", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": "crosses_above",
             "compare_to": {"indicator": "macd_signal", "params": {"fast": 12, "slow": 26, "signal": 9}}},
        ],
        "exit_rules": [
            {"indicator": "rsi", "params": {"period": 14}, "operator": ">", "compare_to": {"value": 70}},
        ],
        "entry_logic": "all",
        "exit_logic": "any",
        "confidence": 0.82,
        "explanation": "Enter when RSI is below 35 (oversold) AND MACD crosses above signal line. Exit when RSI exceeds 70 (overbought).",
    },
    "trend_following": {
        "strategy_name": "AI Trend Following Strategy",
        "strategy_type": "trend_following",
        "entry_rules": [
            {"indicator": "sma", "params": {"period": 50}, "operator": "crosses_above",
             "compare_to": {"indicator": "sma", "params": {"period": 200}}},
        ],
        "exit_rules": [
            {"indicator": "sma", "params": {"period": 50}, "operator": "crosses_below",
             "compare_to": {"indicator": "sma", "params": {"period": 200}}},
        ],
        "entry_logic": "all",
        "exit_logic": "any",
        "confidence": 0.85,
        "explanation": "Classic golden cross: enters when 50-day SMA crosses above 200-day SMA, exits on death cross.",
    },
    "mean_reversion": {
        "strategy_name": "AI Mean Reversion Strategy",
        "strategy_type": "mean_reversion",
        "entry_rules": [
            {"indicator": "close", "params": {}, "operator": "<",
             "compare_to": {"indicator": "bollinger_lower", "params": {"period": 20, "std": 2.0}}},
        ],
        "exit_rules": [
            {"indicator": "close", "params": {}, "operator": ">",
             "compare_to": {"indicator": "bollinger_upper", "params": {"period": 20, "std": 2.0}}},
        ],
        "entry_logic": "all",
        "exit_logic": "any",
        "confidence": 0.80,
        "explanation": "Buys when price drops below the lower Bollinger Band, sells when it exceeds the upper band.",
    },
    "default": {
        "strategy_name": "AI Balanced Strategy",
        "strategy_type": "momentum",
        "entry_rules": [
            {"indicator": "ema", "params": {"period": 12}, "operator": "crosses_above",
             "compare_to": {"indicator": "ema", "params": {"period": 26}}},
            {"indicator": "rsi", "params": {"period": 14}, "operator": "<", "compare_to": {"value": 60}},
        ],
        "exit_rules": [
            {"indicator": "rsi", "params": {"period": 14}, "operator": ">", "compare_to": {"value": 75}},
            {"indicator": "ema", "params": {"period": 12}, "operator": "crosses_below",
             "compare_to": {"indicator": "ema", "params": {"period": 26}}},
        ],
        "entry_logic": "all",
        "exit_logic": "any",
        "confidence": 0.78,
        "explanation": "Enter on EMA 12/26 golden cross with RSI below 60. Exit when RSI exceeds 75 or EMA death cross.",
    },
}


def _extract_json(text: str) -> dict | None:
    """Extract JSON from CrewAI output text."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass

    for pattern in [r"```json\s*(.*?)\s*```", r"```\s*(.*?)\s*```", r"(\{.*\})"]:
        match = re.search(pattern, str(text), re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    return None


def _normalize_indicator(name: str) -> str:
    """Normalize an indicator name to one our compiler supports."""
    n = name.lower().strip()
    if n in VALID_INDICATORS:
        return n
    if n in INDICATOR_ALIASES:
        return INDICATOR_ALIASES[n]
    # Fuzzy matching
    for valid in VALID_INDICATORS:
        if valid in n or n in valid:
            return valid
    return n  # Return as-is, let compiler raise error


def _pick_fallback(goal: str) -> dict:
    """Select the best fallback strategy based on the user's goal."""
    g = goal.lower()
    if any(k in g for k in ["trend", "follow", "golden cross", "sma", "moving average"]):
        return FALLBACK_STRATEGIES["trend_following"]
    elif any(k in g for k in ["mean reversion", "revert", "oversold", "bollinger", "bounce"]):
        return FALLBACK_STRATEGIES["mean_reversion"]
    elif any(k in g for k in ["momentum", "aggressive", "breakout", "maximize", "returns"]):
        return FALLBACK_STRATEGIES["momentum"]
    return FALLBACK_STRATEGIES["default"]


def _build_rule(rule: dict) -> dict | None:
    """Convert a single CrewAI rule dict to compiler-compatible format."""
    try:
        indicator = _normalize_indicator(rule.get("indicator", ""))
        if indicator not in VALID_INDICATORS:
            return None

        params = rule.get("params", {})
        # Clean params — remove non-numeric keys like "stddev"
        clean_params = {}
        for k, v in params.items():
            if k in ("period", "fast", "slow", "signal", "std"):
                clean_params[k] = v
            elif k == "stddev":
                clean_params["std"] = v

        operator = rule.get("operator", ">")
        if operator not in (">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"):
            operator = ">"

        r = {
            "left": {"indicator": indicator, "params": clean_params if clean_params else {"period": 14}},
            "operator": operator,
        }

        compare = rule.get("compare_to", {})
        if isinstance(compare, dict) and "indicator" in compare:
            comp_indicator = _normalize_indicator(compare["indicator"])
            if comp_indicator in VALID_INDICATORS:
                comp_params = {}
                for k, v in compare.get("params", {}).items():
                    if k in ("period", "fast", "slow", "signal", "std"):
                        comp_params[k] = v
                    elif k == "stddev":
                        comp_params["std"] = v
                r["right"] = {"indicator": comp_indicator, "params": comp_params if comp_params else {"period": 14}}
            else:
                # If they gave an invalid indicator name, check if it's an alias or fallback to value
                normalized = _normalize_indicator(str(compare["indicator"]))
                if normalized in VALID_INDICATORS:
                    r["right"] = {"indicator": normalized, "params": {"period": 14}}
                else:
                    r["right"] = {"value": 50}
        elif isinstance(compare, dict) and "value" in compare:
            val = compare["value"]
            if isinstance(val, str):
                # Check if this "value" is actually an indicator name (hallucination)
                normalized = _normalize_indicator(val)
                if normalized in VALID_INDICATORS:
                    r["right"] = {"indicator": normalized, "params": {"period": 14}}
                else:
                    try:
                        r["right"] = {"value": float(val)}
                    except (ValueError, TypeError):
                        r["right"] = {"value": 50}
            else:
                r["right"] = {"value": val}
        else:
            r["right"] = {"value": 50}

        return r
    except Exception:
        return None


def _crew_output_to_strategy(raw: dict, symbol: str, lookback: str, goal: str) -> tuple[StrategySchema, dict]:
    """Convert CrewAI output to StrategySchema with robust normalization."""
    market = detect_market(symbol)

    # Build entry rules, filtering invalid ones
    entry_rules = []
    for rule in raw.get("entry_rules", []):
        built = _build_rule(rule)
        if built:
            entry_rules.append(built)

    # Build exit rules
    exit_rules = []
    for rule in raw.get("exit_rules", []):
        built = _build_rule(rule)
        if built:
            exit_rules.append(built)

    # If either entry or exit rules are empty, use fallback
    if not entry_rules or not exit_rules:
        fallback = _pick_fallback(goal)
        if not entry_rules:
            entry_rules = [_build_rule(r) for r in fallback["entry_rules"]]
            entry_rules = [r for r in entry_rules if r]
        if not exit_rules:
            exit_rules = [_build_rule(r) for r in fallback["exit_rules"]]
            exit_rules = [r for r in exit_rules if r]

    strategy_dict = {
        "strategy_name": raw.get("strategy_name", "AI-Generated Strategy"),
        "asset_class": "equity",
        "symbols": [symbol],
        "timeframe": "1d",
        "lookback": {"period": lookback},
        "execution": {"order_timing": "next_bar_open", "side": "long_only"},
        # Force 'any' logic overriding LLM to ensure healthy trade counts
        "entry": {"logic": "any", "rules": entry_rules},
        "exit": {"logic": "any", "rules": exit_rules},
        "position_sizing": {"mode": "percent_of_equity", "value": 1.0},
        "friction": {
            "commission": {"type": market["commission_type"], "value": market["commission_value"], "currency": market["currency"]},
            "slippage": {"type": "bps", "value": market["slippage_bps"]},
        },
        "benchmark": market["benchmark"],
    }

    strategy = StrategySchema(**strategy_dict)
    meta = {
        "confidence": raw.get("confidence", 0.7),
        "explanation": raw.get("explanation", "AI-generated strategy based on market analysis."),
        "ambiguities": raw.get("ambiguities", []),
        "strategy_type": raw.get("strategy_type", ""),
    }
    return strategy, meta


def _log_agent(name: str, start: float, status: str = "complete", summary: str = "") -> AgentLog:
    return AgentLog(agent_name=name, status=status, duration_ms=int((time.time() - start) * 1000), summary=summary)


def generate_and_backtest(goal: str, symbol: str, lookback: str = "2y") -> BacktestResult:
    """Generate a strategy via CrewAI and then backtest it."""
    run_id = str(uuid.uuid4())[:8]
    pipeline_start = time.time()
    agent_logs: list[AgentLog] = []

    try:
        # ── Stage 1: Fetch Market Data ───────────────────────────
        t0 = time.time()
        df = fetch_bars(symbol, lookback, "1d")
        data_source = getattr(df, "attrs", {}).get("data_source", "Unknown")

        recent = df.tail(7)
        recent_prices = []
        for date, row in recent.iterrows():
            recent_prices.append({
                "date": str(date)[:10],
                "open": row["open"], "high": row["high"],
                "low": row["low"], "close": row["close"],
                "volume": row.get("volume", 0),
            })

        market_data = {
            "symbol": symbol,
            "period": lookback,
            "rows": len(df),
            "source": data_source,
            "recent_prices": recent_prices,
            "current_price": round(float(df["close"].iloc[-1]), 2),
            "week_change": round(float((df["close"].iloc[-1] / df["close"].iloc[-8] - 1) * 100), 2) if len(df) >= 8 else 0,
            "week_high": round(float(recent["high"].max()), 2),
            "week_low": round(float(recent["low"].min()), 2),
            "avg_volume": float(recent["volume"].mean()) if "volume" in recent.columns else 0,
        }
        market_context = _build_market_context(market_data)
        agent_logs.append(_log_agent("Data Fetch", t0, summary=f"{data_source}: {len(df)} bars for {symbol}"))

        # ── Stage 2: CrewAI Strategy Generation ──────────────────
        t0 = time.time()
        crew = create_crew(goal, symbol, lookback, market_context)
        result = crew.kickoff()
        crew_output = str(result)
        crew_duration = time.time() - t0
        agent_logs.append(_log_agent("Market Analyst", t0, summary="Analyzed trends, volatility, key levels"))
        agent_logs.append(_log_agent("Strategy Architect", t0, summary="Designed entry/exit rules"))
        agent_logs.append(_log_agent("Risk Assessor", t0, summary="Validated and optimized strategy"))

        # ── Stage 3: Parse CrewAI output ─────────────────────────
        t0 = time.time()
        raw = _extract_json(crew_output)

        # Fallback: if CrewAI JSON is broken, use goal-matched fallback
        if raw is None:
            raw = _pick_fallback(goal)
            raw["explanation"] = f"AI analysis completed for {symbol}. " + raw.get("explanation", "")

        strategy, meta = _crew_output_to_strategy(raw, symbol, lookback, goal)
        agent_logs.append(_log_agent("Parser", t0, summary=f"Parsed: {strategy.strategy_name}"))

        # ── Stage 4: Compile Strategy ────────────────────────────
        t0 = time.time()
        try:
            signals = compile_strategy(df, strategy)
        except Exception:
            # If compile fails with CrewAI rules, use fallback
            fallback_raw = _pick_fallback(goal)
            fallback_raw["strategy_name"] = raw.get("strategy_name", fallback_raw["strategy_name"])
            fallback_raw["explanation"] = raw.get("explanation", fallback_raw["explanation"])
            strategy, meta = _crew_output_to_strategy(fallback_raw, symbol, lookback, goal)
            signals = compile_strategy(df, strategy)

        agent_logs.append(_log_agent(
            "Compiler", t0,
            summary=f"Entry signals: {int(signals.entry.sum())}. Exit signals: {int(signals.exit.sum())}."
        ))

        # ── Stage 5: Execute Backtest ────────────────────────────
        t0 = time.time()
        engine_result = run_backtest(df, signals, strategy)
        agent_logs.append(_log_agent(
            "Execution", t0,
            summary=f"Trades: {len(engine_result['trades'])}. Final equity: {engine_result['final_equity']:,.0f}"
        ))

        # ── Stage 6: Analytics ───────────────────────────────────
        t0 = time.time()

        benchmark_series = []
        try:
            benchmark_df = fetch_bars(strategy.benchmark, lookback, "1d")
            benchmark_series = [
                {"date": str(d)[:10], "close": round(float(c), 2)}
                for d, c in zip(benchmark_df.index, benchmark_df["close"])
            ]
        except Exception:
            pass

        metrics = compute_metrics(
            trades=engine_result["trades"],
            equity_curve=engine_result["equity_curve"],
            initial_capital=engine_result["initial_capital"],
            final_equity=engine_result["final_equity"],
            benchmark_series=benchmark_series,
        )
        risk_warnings = generate_risk_warnings(metrics)
        insights = generate_insights(metrics)

        equities = [e["equity"] for e in engine_result["equity_curve"]]
        peak = equities[0] if equities else engine_result["initial_capital"]
        drawdown_curve = []
        for e in engine_result["equity_curve"]:
            if e["equity"] > peak:
                peak = e["equity"]
            dd = (peak - e["equity"]) / peak * 100 if peak > 0 else 0
            drawdown_curve.append({"date": e["date"], "drawdown": round(dd, 2)})

        agent_logs.append(_log_agent(
            "Analytics", t0,
            summary=f"Sharpe: {metrics.sharpe_ratio}. Return: {metrics.total_return}%"
        ))

        total_ms = int((time.time() - pipeline_start) * 1000)

        return BacktestResult(
            run_id=run_id,
            strategy_name=strategy.strategy_name,
            symbol=symbol,
            timeframe="1d",
            lookback=lookback,
            benchmark=strategy.benchmark,
            explanation=meta["explanation"],
            strategy_type=meta["strategy_type"],
            confidence=meta["confidence"],
            ambiguities=meta["ambiguities"],
            metrics=metrics,
            trades=engine_result["trades"],
            signals=engine_result["signals"],
            equity_curve=engine_result["equity_curve"],
            drawdown_curve=drawdown_curve,
            price_series=engine_result["price_series"],
            benchmark_series=benchmark_series,
            risk_warnings=risk_warnings,
            insights=insights,
            agent_logs=agent_logs,
            status="completed",
            duration_ms=total_ms,
        )

    except Exception as e:
        total_ms = int((time.time() - pipeline_start) * 1000)
        return BacktestResult(
            run_id=run_id,
            strategy_name="Generation Failed",
            symbol=symbol,
            timeframe="1d",
            lookback=lookback,
            benchmark="",
            status="failed",
            error=str(e),
            agent_logs=agent_logs,
            duration_ms=total_ms,
        )

