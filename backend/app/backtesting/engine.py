"""Backtest simulation engine with lookahead bias protection."""
from __future__ import annotations
import pandas as pd
import numpy as np
from app.models.strategy import StrategySchema
from app.models.result import Trade, Signal
from app.backtesting.compiler import CompiledSignals
from app.data.adapters import detect_market


def run_backtest(
    df: pd.DataFrame,
    signals: CompiledSignals,
    strategy: StrategySchema,
) -> dict:
    """Run the simulation loop.

    Rules:
    - Signals computed on bar close
    - Orders execute on NEXT bar open (lookahead bias protection)
    - Long-only for MVP
    """
    market = detect_market(strategy.symbols[0])
    capital = market["starting_capital"]
    commission_val = strategy.friction.commission.value
    commission_type = strategy.friction.commission.type
    slippage_bps = strategy.friction.slippage.value

    equity = capital
    position = 0
    entry_price = 0.0
    entry_date = ""
    trades: list[Trade] = []
    trade_signals: list[Signal] = []
    equity_curve = []
    trade_num = 0
    cumulative_return = 0.0

    dates = df.index.tolist()
    opens = df["open"].values
    closes = df["close"].values
    entry_vec = signals.entry.values
    exit_vec = signals.exit.values

    for i in range(1, len(df)):
        # Signal from PREVIOUS bar close → execution at current bar open
        signal_bar = i - 1
        exec_price = opens[i]
        date_str = str(dates[i])[:10]

        if position == 0 and entry_vec[signal_bar]:
            # BUY: apply slippage up
            slip = exec_price * slippage_bps / 10000
            buy_price = exec_price + slip

            # Commission
            if commission_type == "flat_per_order":
                comm = commission_val
            else:
                comm = buy_price * equity * commission_val

            shares = (equity - comm) / buy_price
            position = shares
            entry_price = buy_price
            entry_date = date_str

            trade_signals.append(Signal(date=date_str, type="buy", price=round(buy_price, 2)))

        elif position > 0 and exit_vec[signal_bar]:
            # SELL: apply slippage down
            slip = exec_price * slippage_bps / 10000
            sell_price = exec_price - slip

            # Commission
            if commission_type == "flat_per_order":
                comm = commission_val
            else:
                comm = sell_price * position * commission_val

            proceeds = position * sell_price - comm
            pnl = proceeds - (position * entry_price)
            ret_pct = (sell_price - entry_price) / entry_price * 100

            trade_num += 1
            cumulative_return = (proceeds / capital - 1) * 100 if capital > 0 else 0
            entry_days = max(1, (dates[i] - dates[dates.index(dates[i]) if entry_date == date_str else 0]).days) if hasattr(dates[i], 'days') else 1

            # Calculate duration
            try:
                from datetime import datetime as dt
                ed = pd.Timestamp(entry_date)
                xd = pd.Timestamp(date_str)
                dur = max(1, (xd - ed).days)
            except Exception:
                dur = 1

            trades.append(Trade(
                trade_number=trade_num,
                entry_date=entry_date,
                entry_price=round(entry_price, 2),
                exit_date=date_str,
                exit_price=round(sell_price, 2),
                duration_days=dur,
                return_pct=round(ret_pct, 2),
                pnl=round(pnl, 2),
                cumulative_return=round(cumulative_return, 2),
            ))

            trade_signals.append(Signal(date=date_str, type="sell", price=round(sell_price, 2)))

            equity = proceeds
            position = 0
            entry_price = 0.0

        # Track equity curve
        if position > 0:
            current_val = position * closes[i]
        else:
            current_val = equity

        equity_curve.append({
            "date": date_str,
            "equity": round(current_val, 2),
        })

    # Force close any open position at end
    if position > 0:
        sell_price = closes[-1]
        proceeds = position * sell_price
        pnl = proceeds - position * entry_price
        ret_pct = (sell_price - entry_price) / entry_price * 100
        trade_num += 1
        cumulative_return = (proceeds / capital - 1) * 100

        try:
            ed = pd.Timestamp(entry_date)
            xd = pd.Timestamp(str(dates[-1])[:10])
            dur = max(1, (xd - ed).days)
        except Exception:
            dur = 1

        trades.append(Trade(
            trade_number=trade_num,
            entry_date=entry_date,
            entry_price=round(entry_price, 2),
            exit_date=str(dates[-1])[:10],
            exit_price=round(sell_price, 2),
            duration_days=dur,
            return_pct=round(ret_pct, 2),
            pnl=round(pnl, 2),
            cumulative_return=round(cumulative_return, 2),
        ))
        trade_signals.append(Signal(date=str(dates[-1])[:10], type="sell", price=round(sell_price, 2)))
        equity = proceeds

    # Price series for charting
    price_series = [
        {"date": str(d)[:10], "open": round(o, 2), "high": round(h, 2), "low": round(l, 2), "close": round(c, 2)}
        for d, o, h, l, c in zip(
            dates[signals.warmup:],
            df["open"].values[signals.warmup:],
            df["high"].values[signals.warmup:],
            df["low"].values[signals.warmup:],
            closes[signals.warmup:],
        )
    ]

    return {
        "trades": trades,
        "signals": trade_signals,
        "equity_curve": equity_curve,
        "price_series": price_series,
        "final_equity": equity,
        "initial_capital": capital,
    }
