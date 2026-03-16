"""Pydantic models for strategy definitions."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field
from app.core.enums import Indicator, Operator, OrderTiming, Side, CommissionType, SlippageType, PositionSizingMode


# ── Rule components ──────────────────────────────────────────────

class IndicatorRef(BaseModel):
    indicator: Indicator
    params: dict = Field(default_factory=dict)


class ValueRef(BaseModel):
    value: float


class Rule(BaseModel):
    left: IndicatorRef
    operator: Operator
    right: IndicatorRef | ValueRef


class RuleGroup(BaseModel):
    logic: str = "all"  # "all" or "any"
    rules: list[Rule]


# ── Friction ──────────────────────────────────────────────────────

class Commission(BaseModel):
    type: CommissionType = CommissionType.FLAT_PER_ORDER
    value: float = 20
    currency: str = "INR"


class Slippage(BaseModel):
    type: SlippageType = SlippageType.BPS
    value: float = 10


class Friction(BaseModel):
    commission: Commission = Field(default_factory=Commission)
    slippage: Slippage = Field(default_factory=Slippage)


# ── Position sizing ──────────────────────────────────────────────

class PositionSizing(BaseModel):
    mode: PositionSizingMode = PositionSizingMode.PERCENT_OF_EQUITY
    value: float = 1.0


# ── Execution ────────────────────────────────────────────────────

class Execution(BaseModel):
    order_timing: OrderTiming = OrderTiming.NEXT_BAR_OPEN
    side: Side = Side.LONG_ONLY


class Lookback(BaseModel):
    period: str = "2y"


# ── Full strategy schema ────────────────────────────────────────

class StrategySchema(BaseModel):
    strategy_name: str = "Unnamed Strategy"
    asset_class: str = "equity"
    symbols: list[str] = Field(default_factory=lambda: ["AAPL"])
    timeframe: str = "1d"
    lookback: Lookback = Field(default_factory=Lookback)
    execution: Execution = Field(default_factory=Execution)
    entry: RuleGroup
    exit: RuleGroup
    position_sizing: PositionSizing = Field(default_factory=PositionSizing)
    friction: Friction = Field(default_factory=Friction)
    benchmark: str = "^GSPC"


# ── Parse result ─────────────────────────────────────────────────

class ParseResult(BaseModel):
    parsed_strategy: StrategySchema
    confidence: float = 0.0
    ambiguities: list[str] = Field(default_factory=list)
    explanation: str = ""
    strategy_type: str = ""


# ── API request / response ───────────────────────────────────────

class ParseRequest(BaseModel):
    strategy_text: str
    symbol: str = "AAPL"
    timeframe: str = "1d"
    lookback: str = "2y"
    macro_shield_enabled: bool = True


class BacktestRequest(BaseModel):
    strategy_text: str
    symbol: str = "AAPL"
    timeframe: str = "1d"
    lookback: str = "2y"
    macro_shield_enabled: bool = True
