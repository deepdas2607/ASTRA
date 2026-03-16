"""Enumerations used across the application."""
from enum import Enum


class Indicator(str, Enum):
    SMA = "sma"
    EMA = "ema"
    RSI = "rsi"
    MACD = "macd"
    MACD_SIGNAL = "macd_signal"
    MACD_HISTOGRAM = "macd_histogram"
    BOLLINGER_UPPER = "bollinger_upper"
    BOLLINGER_LOWER = "bollinger_lower"
    BOLLINGER_MID = "bollinger_mid"
    VWAP = "vwap"
    CLOSE = "close"
    OPEN = "open"
    HIGH = "high"
    LOW = "low"
    VOLUME = "volume"


class Operator(str, Enum):
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    EQ = "=="
    CROSSES_ABOVE = "crosses_above"
    CROSSES_BELOW = "crosses_below"


class OrderTiming(str, Enum):
    NEXT_BAR_OPEN = "next_bar_open"
    CLOSE_SAME_BAR = "close_same_bar"


class Side(str, Enum):
    LONG_ONLY = "long_only"
    LONG_SHORT = "long_short"


class CommissionType(str, Enum):
    FLAT_PER_ORDER = "flat_per_order"
    PERCENTAGE = "percentage"


class SlippageType(str, Enum):
    BPS = "bps"


class PositionSizingMode(str, Enum):
    PERCENT_OF_EQUITY = "percent_of_equity"
    FIXED_NOTIONAL = "fixed_notional"
    FIXED_QUANTITY = "fixed_quantity"


class RunStatus(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    REASONING = "reasoning"
    COMPILING = "compiling"
    EXECUTING = "executing"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentName(str, Enum):
    SUPERVISOR = "Supervisor"
    PARSER = "Parser"
    REASONING = "Reasoning"
    COMPILER = "Compiler"
    EXECUTION = "Execution"
    ANALYTICS = "Analytics"
    IMPROVEMENT = "Improvement"
