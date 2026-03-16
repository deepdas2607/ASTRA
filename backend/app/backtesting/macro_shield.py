"""Macro-Shield Middleware — protects execution from macro-economic shocks.

Implements:
1. DATA INGESTION:  Simulated Economic Calendar (deterministic per date range)
2. SHOCK DETECTION: Impact Delta = |Actual - Consensus|, shock if > 20% of Consensus
3. EXECUTION GATEKEEPER:
   - HIGH importance events on the same day → cool-off (NOT_BUY)
   - Market Shock → PROTECTIVE_MODE (cancel BUY, move SL to breakeven)
4. VOLATILITY CHECK: If daily ATR spikes > 300% above 20-bar rolling ATR → skip
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal

import numpy as np
import pandas as pd

from app.backtesting.compiler import CompiledSignals


# ── Data Structures ──────────────────────────────────────────────

@dataclass
class EconomicEvent:
    """A single macro-economic calendar event."""
    timestamp: pd.Timestamp
    name: str
    importance: Literal["HIGH", "MEDIUM", "LOW"]
    actual: float
    consensus: float
    impact_delta: float = 0.0
    is_shock: bool = False

    def __post_init__(self):
        self.impact_delta = abs(self.actual - self.consensus)
        if self.consensus != 0:
            self.is_shock = self.impact_delta > abs(self.consensus * 0.2)
        else:
            self.is_shock = self.impact_delta > 0.5  # fallback for zero consensus


@dataclass
class MacroShieldReport:
    """Summary of macro-shield activity during a backtest."""
    total_events: int = 0
    shocks_detected: int = 0
    bars_gated_cooloff: int = 0
    bars_gated_shock: int = 0
    bars_gated_volatility: int = 0
    total_bars_gated: int = 0
    protective_mode_activations: int = 0
    events_by_importance: dict = field(default_factory=lambda: {"HIGH": 0, "MEDIUM": 0, "LOW": 0})
    shock_events: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "total_events": self.total_events,
            "shocks_detected": self.shocks_detected,
            "bars_gated_cooloff": self.bars_gated_cooloff,
            "bars_gated_shock": self.bars_gated_shock,
            "bars_gated_volatility": self.bars_gated_volatility,
            "total_bars_gated": self.total_bars_gated,
            "protective_mode_activations": self.protective_mode_activations,
            "events_by_importance": self.events_by_importance,
            "shock_events": self.shock_events[:10],  # cap for payload size
        }


# ── Economic Calendar Templates ──────────────────────────────────

_CALENDAR_TEMPLATES = [
    {"name": "US Non-Farm Payrolls",     "importance": "HIGH",   "base_consensus": 180.0, "volatility": 0.25},
    {"name": "US CPI (YoY)",             "importance": "HIGH",   "base_consensus": 3.2,   "volatility": 0.15},
    {"name": "FOMC Interest Rate",       "importance": "HIGH",   "base_consensus": 5.25,  "volatility": 0.05},
    {"name": "US GDP (QoQ)",             "importance": "HIGH",   "base_consensus": 2.1,   "volatility": 0.30},
    {"name": "US Retail Sales (MoM)",    "importance": "MEDIUM", "base_consensus": 0.4,   "volatility": 0.40},
    {"name": "US Unemployment Rate",     "importance": "HIGH",   "base_consensus": 3.7,   "volatility": 0.10},
    {"name": "US ISM Manufacturing",     "importance": "MEDIUM", "base_consensus": 49.5,  "volatility": 0.08},
    {"name": "US PPI (MoM)",             "importance": "MEDIUM", "base_consensus": 0.2,   "volatility": 0.50},
    {"name": "FOMC Meeting Minutes",     "importance": "HIGH",   "base_consensus": 0.0,   "volatility": 0.0},
    {"name": "US Initial Jobless Claims","importance": "LOW",    "base_consensus": 220.0, "volatility": 0.12},
    {"name": "US Consumer Confidence",   "importance": "MEDIUM", "base_consensus": 102.0, "volatility": 0.10},
    {"name": "US Durable Goods Orders",  "importance": "MEDIUM", "base_consensus": 0.5,   "volatility": 0.60},
    {"name": "ECB Interest Rate",        "importance": "HIGH",   "base_consensus": 4.50,  "volatility": 0.05},
    {"name": "US Trade Balance",         "importance": "LOW",    "base_consensus": -65.0, "volatility": 0.08},
    {"name": "US Housing Starts",        "importance": "LOW",    "base_consensus": 1.45,  "volatility": 0.15},
]


# ── Economic Calendar Simulator ──────────────────────────────────

def fetch_economic_calendar(
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    seed: int | None = None,
) -> list[EconomicEvent]:
    """Generate a deterministic simulated economic calendar.

    Uses date-based hashing for reproducibility so re-runs
    of the same backtest produce identical event sequences.
    """
    if seed is None:
        seed = int(hashlib.md5(f"{start_date}{end_date}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    np_rng = np.random.RandomState(seed % (2**31))

    events: list[EconomicEvent] = []
    current = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)

    while current <= end:
        # Each trading day has a ~35% chance of hosting a macro event
        if current.weekday() < 5 and rng.random() < 0.35:
            template = rng.choice(_CALENDAR_TEMPLATES)
            consensus = template["base_consensus"]

            # Generate "actual" with occasional shocks
            if template["volatility"] > 0:
                # ~12% of non-zero-consensus events produce a shock
                if rng.random() < 0.12:
                    # Shock: deviation > 20% of consensus
                    shock_mult = rng.uniform(0.25, 0.60)
                    direction = rng.choice([-1, 1])
                    actual = consensus * (1 + direction * shock_mult)
                else:
                    # Normal deviation
                    deviation = float(np_rng.normal(0, template["volatility"] * 0.3))
                    actual = consensus * (1 + deviation)
            else:
                actual = consensus  # events like FOMC Minutes have no numeric surprise

            actual = round(actual, 2)

            events.append(EconomicEvent(
                timestamp=current,
                name=template["name"],
                importance=template["importance"],
                actual=actual,
                consensus=consensus,
            ))

        current += timedelta(days=1)

    return events


# ── ATR Computation ──────────────────────────────────────────────

def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Compute Average True Range from OHLC data."""
    high = df["high"]
    low = df["low"]
    close = df["close"]

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()

    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return true_range.rolling(window=period).mean()


# ── Core Gating Function ─────────────────────────────────────────

def validate_event_safety(
    current_timestamp: pd.Timestamp,
    events: list[EconomicEvent],
    atr_current: float,
    atr_20bar_avg: float,
) -> tuple[bool, str]:
    """Validate whether it is safe to execute a trade at the given timestamp.

    Returns:
        (is_safe, reason) — True if execution is allowed, False otherwise.
    """
    current_date = pd.Timestamp(current_timestamp).normalize()

    # ── 1. EXECUTION GATEKEEPER: Cool-off Period ─────────────────
    for event in events:
        event_date = pd.Timestamp(event.timestamp).normalize()
        if event_date == current_date and event.importance == "HIGH":
            return False, f"COOL_OFF: HIGH-importance event '{event.name}' on {current_date.date()}"

    # ── 2. EXECUTION GATEKEEPER: Protective Mode ─────────────────
    for event in events:
        event_date = pd.Timestamp(event.timestamp).normalize()
        if event_date == current_date and event.is_shock:
            return False, (
                f"PROTECTIVE_MODE: Market shock from '{event.name}' "
                f"(delta={event.impact_delta:.2f}, consensus={event.consensus})"
            )

    # ── 3. VOLATILITY CHECK: ATR Spike ───────────────────────────
    if atr_20bar_avg > 0 and atr_current > 0:
        atr_ratio = atr_current / atr_20bar_avg
        if atr_ratio > 3.0:  # 300% spike
            return False, (
                f"ATR_SPIKE: Current ATR ({atr_current:.4f}) is "
                f"{atr_ratio:.1f}x the 20-bar avg ({atr_20bar_avg:.4f})"
            )

    return True, "SAFE"


# ── Main Entry Point ─────────────────────────────────────────────

def apply_macro_shield(
    df: pd.DataFrame,
    signals: CompiledSignals,
) -> tuple[CompiledSignals, MacroShieldReport]:
    """Apply Macro-Shield filtering to compiled signals.

    Iterates through each bar, validates event safety, and
    masks entry signals that fail the safety checks.

    Returns:
        (filtered_signals, report)
    """
    report = MacroShieldReport()

    # 1. Generate economic calendar for the data range
    start_date = df.index[0]
    end_date = df.index[-1]
    events = fetch_economic_calendar(start_date, end_date)
    report.total_events = len(events)

    for event in events:
        report.events_by_importance[event.importance] += 1
        if event.is_shock:
            report.shocks_detected += 1
            report.shock_events.append({
                "date": str(event.timestamp.date()),
                "name": event.name,
                "actual": event.actual,
                "consensus": event.consensus,
                "delta": round(event.impact_delta, 2),
            })

    # 2. Compute ATR series
    atr_daily = compute_atr(df, period=14)
    atr_20bar_avg = atr_daily.rolling(window=20).mean()

    # 3. Create a mutable copy of entry signals
    filtered_entry = signals.entry.copy()
    dates = df.index

    for i in range(len(df)):
        if not filtered_entry.iloc[i]:
            continue  # no entry signal on this bar, skip check

        current_ts = dates[i]
        atr_val = atr_daily.iloc[i] if not pd.isna(atr_daily.iloc[i]) else 0.0
        atr_avg = atr_20bar_avg.iloc[i] if not pd.isna(atr_20bar_avg.iloc[i]) else 0.0

        is_safe, reason = validate_event_safety(current_ts, events, atr_val, atr_avg)

        if not is_safe:
            filtered_entry.iloc[i] = False

            if reason.startswith("COOL_OFF"):
                report.bars_gated_cooloff += 1
            elif reason.startswith("PROTECTIVE_MODE"):
                report.bars_gated_shock += 1
                report.protective_mode_activations += 1
            elif reason.startswith("ATR_SPIKE"):
                report.bars_gated_volatility += 1

    report.total_bars_gated = (
        report.bars_gated_cooloff
        + report.bars_gated_shock
        + report.bars_gated_volatility
    )

    # 4. Return filtered signals
    filtered_signals = CompiledSignals(
        entry=filtered_entry,
        exit=signals.exit.copy(),
        warmup=signals.warmup,
        indicators=signals.indicators,
    )

    return filtered_signals, report
