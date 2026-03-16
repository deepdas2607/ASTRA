"""Data adapter with multi-source fallback chain.

Priority:
1. Yahoo Finance chart API (direct HTTP — ~200ms)
2. Stooq API (free, no key, CSV-based)
3. Alpha Vantage API (free key required)
4. Built-in sample data (GBM — guaranteed)
"""
from __future__ import annotations
import time
import random
import httpx
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from app.core.config import settings

# ── In-memory cache ──────────────────────────────────────────────
_cache: dict[str, tuple[float, pd.DataFrame]] = {}

PERIOD_MAP = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825, "10y": 3650,
    "1w": 7, "2w": 14,
}


def _cache_key(symbol: str, period: str) -> str:
    return f"{symbol}|{period}"


def fetch_bars(symbol: str, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
    """Download OHLCV bars with multi-source fallback chain."""
    key = _cache_key(symbol, period)
    now = time.time()

    if key in _cache:
        ts, df = _cache[key]
        if now - ts < settings.CACHE_TTL_SECONDS:
            return df.copy()

    # Fallback chain
    sources = [
        ("Yahoo Finance", lambda: _try_yahoo_direct(symbol, period, interval)),
        ("Stooq", lambda: _try_stooq(symbol, period)),
        ("Alpha Vantage", lambda: _try_alpha_vantage(symbol, period)),
        ("Sample Data", lambda: _generate_sample_data(symbol, period)),
    ]

    data_source_used = "Unknown"
    df = None

    for source_name, fetcher in sources:
        try:
            df = fetcher()
            if df is not None and not df.empty and len(df) >= 5:
                data_source_used = source_name
                break
        except Exception:
            continue

    if df is None or df.empty:
        df = _generate_sample_data(symbol, period)
        data_source_used = "Sample Data"

    df = _quality_checks(df, symbol)
    df.attrs["data_source"] = data_source_used

    _cache[key] = (now, df)
    return df.copy()


# ── Source 1: Yahoo Finance Direct API ───────────────────────────

def _try_yahoo_direct(symbol: str, period: str, interval: str) -> pd.DataFrame | None:
    """Fetch via Yahoo Finance v8 chart API directly."""
    try:
        days = PERIOD_MAP.get(period, 730)
        end_ts = int(time.time())
        start_ts = end_ts - (days * 86400)

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        params = {
            "period1": start_ts,
            "period2": end_ts,
            "interval": interval,
            "includePrePost": "false",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        resp = httpx.get(url, params=params, headers=headers, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            return None

        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None

        chart = result[0]
        timestamps = chart.get("timestamp", [])
        quote = chart.get("indicators", {}).get("quote", [{}])[0]

        if not timestamps or not quote:
            return None

        df = pd.DataFrame({
            "open": quote.get("open", []),
            "high": quote.get("high", []),
            "low": quote.get("low", []),
            "close": quote.get("close", []),
            "volume": quote.get("volume", []),
        }, index=pd.to_datetime(timestamps, unit="s"))

        df.index.name = "Date"
        df = df.dropna(subset=["close"])
        return df if len(df) >= 10 else None

    except Exception:
        return None


# ── Source 2: Stooq API ──────────────────────────────────────────

def _try_stooq(symbol: str, period: str) -> pd.DataFrame | None:
    """Fetch via Stooq CSV API (free, no API key)."""
    try:
        # Map symbol format: AAPL → AAPL.US, TCS.NS stays as-is
        stooq_symbol = symbol
        if "." not in symbol and not symbol.startswith("^"):
            stooq_symbol = f"{symbol}.US"

        days = PERIOD_MAP.get(period, 730)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        url = "https://stooq.com/q/d/l/"
        params = {
            "s": stooq_symbol.lower(),
            "d1": start_date.strftime("%Y%m%d"),
            "d2": end_date.strftime("%Y%m%d"),
            "i": "d",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        resp = httpx.get(url, params=params, headers=headers, timeout=15)
        if resp.status_code != 200:
            return None

        # Check if response is actually CSV, not an error page
        text = resp.text
        if "No data" in text or "<html" in text.lower() or len(text) < 50:
            return None

        from io import StringIO
        df = pd.read_csv(StringIO(text))

        if df.empty or "Close" not in df.columns:
            return None

        df.columns = [c.lower() for c in df.columns]
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        df.index.name = "Date"

        return df if len(df) >= 10 else None

    except Exception:
        return None


# ── Source 3: Alpha Vantage API ──────────────────────────────────

def _try_alpha_vantage(symbol: str, period: str) -> pd.DataFrame | None:
    """Fetch via Alpha Vantage API (free key required)."""
    api_key = settings.ALPHA_VANTAGE_KEY
    if not api_key:
        return None

    try:
        # Strip exchange suffix for Alpha Vantage
        av_symbol = symbol.replace(".NS", ".BSE").replace(".BO", ".BOM")

        url = "https://www.alphavantage.co/query"
        params = {
            "function": "TIME_SERIES_DAILY",
            "symbol": av_symbol,
            "apikey": api_key,
            "outputsize": "full",
            "datatype": "json",
        }

        resp = httpx.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return None

        data = resp.json()
        ts = data.get("Time Series (Daily)", {})
        if not ts:
            return None

        rows = []
        for date_str, values in ts.items():
            rows.append({
                "date": pd.to_datetime(date_str),
                "open": float(values["1. open"]),
                "high": float(values["2. high"]),
                "low": float(values["3. low"]),
                "close": float(values["4. close"]),
                "volume": float(values["5. volume"]),
            })

        df = pd.DataFrame(rows).set_index("date").sort_index()
        df.index.name = "Date"

        # Trim to requested period
        days = PERIOD_MAP.get(period, 730)
        cutoff = datetime.now() - timedelta(days=days)
        df = df[df.index >= cutoff]

        return df if len(df) >= 10 else None

    except Exception:
        return None


# ── Source 4: Sample Data Generator ──────────────────────────────

def _generate_sample_data(symbol: str, period: str) -> pd.DataFrame:
    """Generate realistic-looking sample OHLCV data using GBM."""
    days = PERIOD_MAP.get(period, 500)
    start_prices = {
        "AAPL": 150, "TSLA": 250, "GOOGL": 140, "MSFT": 380, "AMZN": 180,
        "META": 500, "NVDA": 800, "NFLX": 600, "SPY": 480,
        "TCS.NS": 3800, "RELIANCE.NS": 2500, "INFY.NS": 1500, "HDFCBANK.NS": 1600,
        "BTC-USD": 45000, "ETH-USD": 3000,
    }
    base_price = start_prices.get(symbol.upper(), 100 + random.random() * 200)

    mu = 0.0003
    sigma = 0.018
    random.seed(hash(symbol) % 2**32)
    np.random.seed(hash(symbol) % 2**32)

    dates = pd.bdate_range(end=datetime.now(), periods=days)
    returns = np.random.normal(mu, sigma, days)
    prices = base_price * np.exp(np.cumsum(returns))

    df = pd.DataFrame(index=dates)
    df["close"] = prices
    df["open"] = np.roll(prices, 1) * (1 + np.random.normal(0, 0.002, days))
    df["open"].iloc[0] = base_price
    df["high"] = np.maximum(df["open"], df["close"]) * (1 + np.abs(np.random.normal(0, 0.008, days)))
    df["low"] = np.minimum(df["open"], df["close"]) * (1 - np.abs(np.random.normal(0, 0.008, days)))
    df["volume"] = np.random.randint(5_000_000, 80_000_000, days).astype(float)

    df.index.name = "Date"
    return df


# ── Quality Checks ───────────────────────────────────────────────

def _quality_checks(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Run data quality checks."""
    if df.index.duplicated().any():
        df = df[~df.index.duplicated(keep="last")]
    if (df["close"] <= 0).any() or (df["open"] <= 0).any():
        raise ValueError(f"Non-positive prices detected for {symbol}.")
    df = df.ffill(limit=3)
    df = df.dropna(subset=["close"])
    return df


# ── Market Detection ─────────────────────────────────────────────

def detect_market(symbol: str) -> dict:
    """Detect market type and return default parameters."""
    s = symbol.upper()
    if s.endswith(".NS") or s.endswith(".BO"):
        return {
            "currency": "INR", "benchmark": "^NSEI",
            "commission_type": "flat_per_order", "commission_value": 20,
            "slippage_bps": 10, "starting_capital": 1_000_000,
        }
    elif s.startswith("BTC") or s.startswith("ETH") or "-USD" in s:
        return {
            "currency": "USD", "benchmark": "BTC-USD",
            "commission_type": "percentage", "commission_value": 0.001,
            "slippage_bps": 15, "starting_capital": 100_000,
        }
    else:
        return {
            "currency": "USD", "benchmark": "^GSPC",
            "commission_type": "percentage", "commission_value": 0,
            "slippage_bps": 5, "starting_capital": 100_000,
        }
