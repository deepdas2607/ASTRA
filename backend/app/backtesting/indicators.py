"""Indicator computation library."""
from __future__ import annotations
import pandas as pd
import numpy as np


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    fast_ema = ema(series, fast)
    slow_ema = ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bollinger_bands(series: pd.Series, period: int = 20, std: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = sma(series, period)
    offset = series.rolling(window=period).std() * std
    return mid + offset, mid - offset, mid


def vwap(df: pd.DataFrame) -> pd.Series:
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    return (typical_price * df["volume"]).cumsum() / df["volume"].cumsum()


def compute_indicator(df: pd.DataFrame, indicator_name: str, params: dict) -> pd.Series:
    """Compute a named indicator from OHLCV data."""
    close = df["close"]
    name = indicator_name.lower()

    if name == "sma":
        return sma(close, params.get("period", 20))
    elif name == "ema":
        return ema(close, params.get("period", 20))
    elif name == "rsi":
        return rsi(close, params.get("period", 14))
    elif name == "macd":
        ml, _, _ = macd(close, params.get("fast", 12), params.get("slow", 26), params.get("signal", 9))
        return ml
    elif name == "macd_signal":
        _, sl, _ = macd(close, params.get("fast", 12), params.get("slow", 26), params.get("signal", 9))
        return sl
    elif name == "macd_histogram":
        _, _, h = macd(close, params.get("fast", 12), params.get("slow", 26), params.get("signal", 9))
        return h
    elif name == "bollinger_upper":
        u, _, _ = bollinger_bands(close, params.get("period", 20), params.get("std", 2.0))
        return u
    elif name == "bollinger_lower":
        _, l, _ = bollinger_bands(close, params.get("period", 20), params.get("std", 2.0))
        return l
    elif name == "bollinger_mid":
        _, _, m = bollinger_bands(close, params.get("period", 20), params.get("std", 2.0))
        return m
    elif name == "vwap":
        return vwap(df)
    elif name in ("close", "open", "high", "low", "volume"):
        return df[name]
    else:
        raise ValueError(f"Unsupported indicator: {indicator_name}")
