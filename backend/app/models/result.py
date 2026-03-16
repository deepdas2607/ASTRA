"""Pydantic models for backtest results."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
import datetime


class Trade(BaseModel):
    trade_number: int
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    duration_days: int
    return_pct: float
    pnl: float
    cumulative_return: float


class Metrics(BaseModel):
    total_return: float = 0.0
    annualized_return: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    trade_count: int = 0
    avg_trade_return: float = 0.0
    profit_factor: float = 0.0
    avg_trade_duration: float = 0.0
    benchmark_return: float = 0.0
    alpha: float = 0.0


class Signal(BaseModel):
    date: str
    type: str  # "buy" or "sell"
    price: float


class RiskWarning(BaseModel):
    code: str
    message: str


class Insight(BaseModel):
    message: str


class AgentLog(BaseModel):
    agent_name: str
    status: str
    duration_ms: int
    summary: str = ""


class BacktestResult(BaseModel):
    run_id: str
    strategy_name: str
    symbol: str
    timeframe: str
    lookback: str
    benchmark: str
    explanation: str = ""
    strategy_type: str = ""
    confidence: float = 0.0
    ambiguities: list[str] = Field(default_factory=list)

    # Core results
    metrics: Metrics = Field(default_factory=Metrics)
    trades: list[Trade] = Field(default_factory=list)
    signals: list[Signal] = Field(default_factory=list)
    equity_curve: list[dict] = Field(default_factory=list)
    drawdown_curve: list[dict] = Field(default_factory=list)
    price_series: list[dict] = Field(default_factory=list)
    benchmark_series: list[dict] = Field(default_factory=list)

    # Diagnostics
    risk_warnings: list[RiskWarning] = Field(default_factory=list)
    insights: list[Insight] = Field(default_factory=list)
    agent_logs: list[AgentLog] = Field(default_factory=list)

    # Macro-Shield
    macro_shield_report: dict = Field(default_factory=dict)

    status: str = "completed"
    error: str | None = None
    duration_ms: int = 0
