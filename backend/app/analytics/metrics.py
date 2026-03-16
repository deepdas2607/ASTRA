"""Analytics — compute metrics, insights, and risk warnings."""
from __future__ import annotations
import numpy as np
from app.models.result import Metrics, RiskWarning, Insight, Trade


def compute_metrics(
    trades: list[Trade],
    equity_curve: list[dict],
    initial_capital: float,
    final_equity: float,
    benchmark_series: list[dict] | None = None,
) -> Metrics:
    """Compute all tearsheet metrics from trade data."""
    total_return = (final_equity - initial_capital) / initial_capital * 100 if initial_capital else 0

    # Daily returns from equity curve
    equities = [e["equity"] for e in equity_curve]
    if len(equities) > 1:
        daily_returns = np.diff(equities) / equities[:-1]
    else:
        daily_returns = np.array([0.0])

    trading_days = len(equities)

    # Annualized return
    if trading_days > 0 and total_return > -100:
        ann_return = ((1 + total_return / 100) ** (252 / max(trading_days, 1)) - 1) * 100
    else:
        ann_return = 0.0

    # Sharpe ratio
    if len(daily_returns) > 1 and np.std(daily_returns) > 0:
        sharpe = float(np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(252))
    else:
        sharpe = 0.0

    # Sortino ratio
    neg_returns = daily_returns[daily_returns < 0]
    if len(neg_returns) > 0 and np.std(neg_returns) > 0:
        sortino = float(np.mean(daily_returns) / np.std(neg_returns) * np.sqrt(252))
    else:
        sortino = 0.0

    # Max drawdown
    peak = equities[0] if equities else initial_capital
    max_dd = 0.0
    drawdowns = []
    for eq in equities:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100 if peak > 0 else 0
        max_dd = max(max_dd, dd)
        drawdowns.append(dd)

    # Trade statistics
    trade_count = len(trades)
    if trade_count > 0:
        wins = [t for t in trades if t.return_pct > 0]
        losses = [t for t in trades if t.return_pct <= 0]
        win_rate = len(wins) / trade_count * 100
        avg_return = sum(t.return_pct for t in trades) / trade_count
        avg_duration = sum(t.duration_days for t in trades) / trade_count

        win_sum = sum(t.return_pct for t in wins) if wins else 0
        loss_sum = abs(sum(t.return_pct for t in losses)) if losses else 0
        profit_factor = win_sum / loss_sum if loss_sum > 0 else float("inf") if win_sum > 0 else 0
    else:
        win_rate = 0.0
        avg_return = 0.0
        avg_duration = 0.0
        profit_factor = 0.0

    # Benchmark return
    bench_return = 0.0
    if benchmark_series and len(benchmark_series) > 1:
        b_start = benchmark_series[0]["close"]
        b_end = benchmark_series[-1]["close"]
        bench_return = (b_end - b_start) / b_start * 100 if b_start > 0 else 0

    alpha = ann_return - bench_return

    return Metrics(
        total_return=round(total_return, 2),
        annualized_return=round(ann_return, 2),
        sharpe_ratio=round(sharpe, 2),
        sortino_ratio=round(sortino, 2),
        max_drawdown=round(max_dd, 2),
        win_rate=round(win_rate, 2),
        trade_count=trade_count,
        avg_trade_return=round(avg_return, 2),
        profit_factor=round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
        avg_trade_duration=round(avg_duration, 1),
        benchmark_return=round(bench_return, 2),
        alpha=round(alpha, 2),
    )


def generate_risk_warnings(metrics: Metrics) -> list[RiskWarning]:
    """Generate deterministic risk warnings from metrics."""
    warnings = []
    if metrics.trade_count < 5:
        warnings.append(RiskWarning(code="LOW_TRADES", message=f"Low trade count: {metrics.trade_count} trades — results may not be statistically significant"))
    if metrics.max_drawdown > 25:
        warnings.append(RiskWarning(code="HIGH_DD", message=f"High drawdown: {metrics.max_drawdown:.1f}% — consider adding stop-loss rules"))
    if metrics.win_rate < 35 and metrics.trade_count > 0:
        warnings.append(RiskWarning(code="LOW_WINRATE", message=f"Low win rate: {metrics.win_rate:.1f}% — strategy depends on outsized winners"))
    if metrics.trade_count > 50:
        warnings.append(RiskWarning(code="HIGH_TURNOVER", message=f"High turnover: {metrics.trade_count} trades — commission drag may be significant"))
    if metrics.profit_factor < 1 and metrics.trade_count > 0:
        warnings.append(RiskWarning(code="UNPROFITABLE", message="Profit factor below 1 — losing more on losers than gaining on winners"))
    return warnings


def generate_insights(metrics: Metrics) -> list[Insight]:
    """Generate deterministic factual insights."""
    insights = []
    if metrics.sharpe_ratio > 1.5:
        insights.append(Insight(message="Strong risk-adjusted returns"))
    if metrics.total_return > metrics.benchmark_return:
        diff = round(metrics.total_return - metrics.benchmark_return, 2)
        insights.append(Insight(message=f"Strategy outperformed benchmark by {diff}%"))
    elif metrics.benchmark_return > 0:
        insights.append(Insight(message=f"Strategy underperformed benchmark by {round(metrics.benchmark_return - metrics.total_return, 2)}%"))
    if metrics.avg_trade_duration > 60:
        insights.append(Insight(message=f"Long average holding period: {metrics.avg_trade_duration:.0f} days"))
    if metrics.max_drawdown > 30:
        insights.append(Insight(message=f"Large drawdown of {metrics.max_drawdown:.1f}% — consider adding exit rules"))
    if metrics.trade_count > 0 and metrics.win_rate > 60:
        insights.append(Insight(message=f"High win rate of {metrics.win_rate:.1f}%"))
    return insights
