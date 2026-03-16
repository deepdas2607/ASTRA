"""Strategy Compiler — converts validated schema into signal vectors."""
from __future__ import annotations
import pandas as pd
import numpy as np
from app.models.strategy import StrategySchema, Rule, IndicatorRef, ValueRef
from app.backtesting.indicators import compute_indicator


def _get_indicator_period(ref: IndicatorRef) -> int:
    """Extract the period from an indicator reference."""
    return ref.params.get("period", 0)


def _compute_side(df: pd.DataFrame, ref: IndicatorRef | ValueRef) -> pd.Series:
    """Compute a series for one side of a rule (indicator or constant)."""
    if isinstance(ref, ValueRef):
        return pd.Series(ref.value, index=df.index)
    return compute_indicator(df, ref.indicator, ref.params)


def _evaluate_operator(left: pd.Series, op: str, right: pd.Series) -> pd.Series:
    """Evaluate an operator between two series, returns boolean Series."""
    if op == ">":
        return left > right
    elif op == "<":
        return left < right
    elif op == ">=":
        return left >= right
    elif op == "<=":
        return left <= right
    elif op == "==":
        return left == right
    elif op == "crosses_above":
        prev_left = left.shift(1)
        prev_right = right.shift(1)
        return (prev_left <= prev_right) & (left > right)
    elif op == "crosses_below":
        prev_left = left.shift(1)
        prev_right = right.shift(1)
        return (prev_left >= prev_right) & (left < right)
    else:
        raise ValueError(f"Unsupported operator: {op}")


def _evaluate_rule(df: pd.DataFrame, rule: Rule) -> pd.Series:
    """Evaluate a single rule to a boolean series."""
    left_series = _compute_side(df, rule.left)
    right_series = _compute_side(df, rule.right)
    return _evaluate_operator(left_series, rule.operator, right_series)


def _max_period(strategy: StrategySchema) -> int:
    """Find the maximum indicator period across all rules."""
    periods = []
    for group in [strategy.entry, strategy.exit]:
        for rule in group.rules:
            if isinstance(rule.left, IndicatorRef):
                periods.append(_get_indicator_period(rule.left))
            if isinstance(rule.right, IndicatorRef):
                periods.append(_get_indicator_period(rule.right))
    return max(periods) if periods else 0


class CompiledSignals:
    """Output of the Strategy Compiler."""
    def __init__(
        self,
        entry: pd.Series,
        exit: pd.Series,
        warmup: int,
        indicators: dict[str, pd.Series],
    ):
        self.entry = entry
        self.exit = exit
        self.warmup = warmup
        self.indicators = indicators


def compile_strategy(df: pd.DataFrame, strategy: StrategySchema) -> CompiledSignals:
    """Compile a strategy schema into executable signal vectors.

    The compiler ensures the simulation engine never interprets
    strategy rules directly — improving determinism and testability.
    """
    # Calculate warmup with 20% buffer
    max_p = _max_period(strategy)
    warmup = int(max_p * 1.2) if max_p > 0 else 0

    # Verify sufficient data
    if len(df) < warmup + 10:
        raise ValueError(
            f"Insufficient data: need at least {warmup + 10} bars, got {len(df)}. "
            f"Max indicator period is {max_p}."
        )

    # Compile entry signals
    entry_signals = []
    for rule in strategy.entry.rules:
        entry_signals.append(_evaluate_rule(df, rule))

    if not entry_signals:
        entry = pd.Series(False, index=df.index)
    elif strategy.entry.logic == "all":
        entry = pd.concat(entry_signals, axis=1).all(axis=1)
    else:
        entry = pd.concat(entry_signals, axis=1).any(axis=1)

    # Compile exit signals
    exit_signals = []
    for rule in strategy.exit.rules:
        exit_signals.append(_evaluate_rule(df, rule))

    if not exit_signals:
        exit_sig = pd.Series(False, index=df.index)
    elif strategy.exit.logic == "all":
        exit_sig = pd.concat(exit_signals, axis=1).all(axis=1)
    else:
        exit_sig = pd.concat(exit_signals, axis=1).any(axis=1)

    # Apply warmup — mask early bars
    entry.iloc[:warmup] = False
    exit_sig.iloc[:warmup] = False

    # Fill NaN with False
    entry = entry.fillna(False).astype(bool)
    exit_sig = exit_sig.fillna(False).astype(bool)

    # Collect indicator series for charting
    indicators = {}
    for group in [strategy.entry, strategy.exit]:
        for rule in group.rules:
            if isinstance(rule.left, IndicatorRef):
                key = f"{rule.left.indicator}_{rule.left.params.get('period', '')}"
                if key not in indicators:
                    indicators[key] = compute_indicator(df, rule.left.indicator, rule.left.params)
            if isinstance(rule.right, IndicatorRef):
                key = f"{rule.right.indicator}_{rule.right.params.get('period', '')}"
                if key not in indicators:
                    indicators[key] = compute_indicator(df, rule.right.indicator, rule.right.params)

    return CompiledSignals(entry=entry, exit=exit_sig, warmup=warmup, indicators=indicators)
