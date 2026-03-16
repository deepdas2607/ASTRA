"""Supervisor Agent — orchestrates the full backtest pipeline."""
from __future__ import annotations
import time
import uuid
import traceback
from app.models.strategy import ParseRequest, ParseResult
from app.models.result import BacktestResult, AgentLog, Metrics
from app.parsing.parser import parse_strategy
from app.data.adapters import fetch_bars, detect_market
from app.backtesting.compiler import compile_strategy
from app.backtesting.engine import run_backtest
from app.backtesting.macro_shield import apply_macro_shield
from app.analytics.metrics import compute_metrics, generate_risk_warnings, generate_insights


def _log_agent(name: str, start: float, status: str = "complete", summary: str = "") -> AgentLog:
    return AgentLog(
        agent_name=name,
        status=status,
        duration_ms=int((time.time() - start) * 1000),
        summary=summary,
    )


def run_full_pipeline(req: ParseRequest) -> BacktestResult:
    """Execute the complete agentic pipeline:
    Supervisor → Parser → Reasoning → Compiler → Execution → Analytics
    """
    run_id = str(uuid.uuid4())[:8]
    pipeline_start = time.time()
    agent_logs: list[AgentLog] = []

    try:
        # ── Stage 1: Parser Agent (LLM) ─────────────────────────
        t0 = time.time()
        parse_result: ParseResult = parse_strategy(req)
        agent_logs.append(_log_agent("Parser", t0, summary=f"Confidence: {parse_result.confidence:.0%}"))

        strategy = parse_result.parsed_strategy

        # ── Stage 2: Reasoning Agent (deterministic) ────────────
        t0 = time.time()
        # Validation is already done by Pydantic in the parser
        # Here we add reasoning context
        reasoning_summary = (
            f"Strategy type: {parse_result.strategy_type}. "
            f"Indicators validated. Rules checked."
        )
        agent_logs.append(_log_agent("Reasoning", t0, summary=reasoning_summary))

        # ── Stage 3: Data fetch ─────────────────────────────────
        t0 = time.time()
        symbol = strategy.symbols[0]
        df = fetch_bars(symbol, strategy.lookback.period, strategy.timeframe)

        # Fetch benchmark data
        benchmark_df = None
        benchmark_series = []
        try:
            benchmark_df = fetch_bars(strategy.benchmark, strategy.lookback.period, strategy.timeframe)
            benchmark_series = [
                {"date": str(d)[:10], "close": round(c, 2)}
                for d, c in zip(benchmark_df.index, benchmark_df["close"])
            ]
        except Exception:
            pass  # Benchmark failure is non-fatal

        # ── Stage 4: Compiler Agent ─────────────────────────────
        t0 = time.time()
        signals = compile_strategy(df, strategy)
        agent_logs.append(_log_agent(
            "Compiler", t0,
            summary=f"Warmup: {signals.warmup} bars. Entry signals: {int(signals.entry.sum())}. Exit signals: {int(signals.exit.sum())}."
        ))

        # ── Stage 4.5: Macro-Shield Agent ────────────────────────
        t0 = time.time()
        if req.macro_shield_enabled:
            pre_shield_entries = int(signals.entry.sum())
            signals, shield_report = apply_macro_shield(df, signals)
            post_shield_entries = int(signals.entry.sum())
            gated = pre_shield_entries - post_shield_entries
            agent_logs.append(_log_agent(
                "Macro-Shield", t0,
                summary=(
                    f"Events: {shield_report.total_events}. "
                    f"Shocks: {shield_report.shocks_detected}. "
                    f"Signals gated: {gated}/{pre_shield_entries}."
                ),
            ))
        else:
            from app.backtesting.macro_shield import MacroShieldReport
            shield_report = MacroShieldReport()
            agent_logs.append(_log_agent(
                "Macro-Shield", t0, status="skipped",
                summary="Disabled by user.",
            ))

        # ── Stage 5: Execution Agent ────────────────────────────
        t0 = time.time()
        engine_result = run_backtest(df, signals, strategy)
        agent_logs.append(_log_agent(
            "Execution", t0,
            summary=f"Trades: {len(engine_result['trades'])}. Final equity: {engine_result['final_equity']:,.0f}"
        ))

        # ── Stage 6: Analytics Agent ────────────────────────────
        t0 = time.time()
        metrics = compute_metrics(
            trades=engine_result["trades"],
            equity_curve=engine_result["equity_curve"],
            initial_capital=engine_result["initial_capital"],
            final_equity=engine_result["final_equity"],
            benchmark_series=benchmark_series,
        )
        risk_warnings = generate_risk_warnings(metrics)
        insights = generate_insights(metrics)

        # Drawdown curve
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
            summary=f"Sharpe: {metrics.sharpe_ratio}. Return: {metrics.total_return}%. Warnings: {len(risk_warnings)}"
        ))

        total_ms = int((time.time() - pipeline_start) * 1000)

        return BacktestResult(
            run_id=run_id,
            strategy_name=strategy.strategy_name,
            symbol=symbol,
            timeframe=strategy.timeframe,
            lookback=strategy.lookback.period,
            benchmark=strategy.benchmark,
            explanation=parse_result.explanation,
            strategy_type=parse_result.strategy_type,
            confidence=parse_result.confidence,
            ambiguities=parse_result.ambiguities,
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
            macro_shield_report=shield_report.to_dict(),
            status="completed",
            duration_ms=total_ms,
        )

    except Exception as e:
        total_ms = int((time.time() - pipeline_start) * 1000)
        return BacktestResult(
            run_id=run_id,
            strategy_name="Error",
            symbol=req.symbol,
            timeframe=req.timeframe,
            lookback=req.lookback,
            benchmark="",
            status="failed",
            error=str(e),
            agent_logs=agent_logs,
            duration_ms=total_ms,
        )
