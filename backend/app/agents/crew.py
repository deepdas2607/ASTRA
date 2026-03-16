"""CrewAI agents for AI-powered strategy generation.

Three agents collaborate to create an optimal trading strategy:
1. Market Analyst    — analyzes recent market data
2. Strategy Architect — designs entry/exit rules
3. Risk Assessor     — validates and optimizes
"""
from __future__ import annotations
import json
import os
from crewai import Agent, Task, Crew, Process, LLM
from app.core.config import settings


def _get_llm() -> LLM:
    """Get LLM instance for CrewAI agents."""
    return LLM(
        model="groq/llama-3.1-8b-instant",
        api_key=settings.GROQ_API_KEY,
        temperature=0.2,
    )


def _build_market_context(market_data: dict) -> str:
    """Build market context string from recent data."""
    lines = []
    lines.append(f"Symbol: {market_data['symbol']}")
    lines.append(f"Data period: {market_data['period']}")
    lines.append(f"Data points: {market_data['rows']}")
    lines.append(f"Data source: {market_data.get('source', 'Unknown')}")
    lines.append("")
    lines.append("Recent prices (last 7 trading days):")

    for day in market_data.get("recent_prices", []):
        lines.append(
            f"  {day['date']}: O={day['open']:.2f} H={day['high']:.2f} "
            f"L={day['low']:.2f} C={day['close']:.2f} V={day['volume']:,.0f}"
        )

    lines.append("")
    lines.append(f"Current price: {market_data.get('current_price', 'N/A')}")
    lines.append(f"7-day change: {market_data.get('week_change', 'N/A')}%")
    lines.append(f"7-day high: {market_data.get('week_high', 'N/A')}")
    lines.append(f"7-day low: {market_data.get('week_low', 'N/A')}")
    lines.append(f"Avg volume: {market_data.get('avg_volume', 'N/A'):,.0f}")

    return "\n".join(lines)


def create_crew(user_goal: str, symbol: str, lookback: str, market_context: str) -> Crew:
    """Create the strategy generation crew with 3 specialized agents."""
    llm = _get_llm()

    # ── Agent 1: Market Analyst ──────────────────────────────────
    market_analyst = Agent(
        role="Market Analyst",
        goal=(
            "Analyze the recent market data for the given symbol and identify "
            "key patterns, trends, support/resistance levels, and volatility characteristics."
        ),
        backstory=(
            "You are a seasoned quantitative market analyst with 15 years of experience. "
            "You specialize in technical analysis and pattern recognition. You use indicators "
            "like SMA, EMA, RSI, MACD, and Bollinger Bands to assess market conditions."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Agent 2: Strategy Architect ──────────────────────────────
    strategy_architect = Agent(
        role="Strategy Architect",
        goal=(
            f"Design the most optimal LONG-ONLY trading strategy to achieve this objective: {user_goal}. "
            "Create specific, executable entry (buy) and exit (sell) rules using technical indicators."
        ),
        backstory=(
            "You are an expert algorithmic trading strategist who designs rule-based strategies "
            "for Astra, a long-only backtesting engine. You specialize in designing bullish entry "
            "rules (to buy) and exit rules (to sell). You only use these indicators: "
            "SMA, EMA, RSI, MACD, MACD Signal, Bollinger Upper, Bollinger Lower, Bollinger Mid. "
            "You ensure that entry rules represent bullish setups and exit rules provide profit-taking or stop-loss."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Agent 3: Risk Assessor ───────────────────────────────────
    risk_assessor = Agent(
        role="Risk Assessor",
        goal=(
            "Review the proposed strategy for risk, feasibility, and appropriateness for a long-only engine. "
            "Ensure entry rules are not too restrictive and logic is sound."
        ),
        backstory=(
            "You are a risk management specialist who reviews trading strategies. "
            "You check for common pitfalls: overly restrictive conditions that result in zero trades, "
            "bearish setups in a long-only engine, and parameter sensitivity. You optimize rules "
            "to ensure they generate a healthy number of signals for robust backtesting."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    # ── Tasks ────────────────────────────────────────────────────

    analyze_market = Task(
        description=(
            f"Analyze the recent market data and conditions for {symbol}.\n\n"
            f"Market Data:\n{market_context}\n\n"
            "Provide:\n"
            "1. Current trend direction (bullish/bearish/sideways)\n"
            "2. Key support and resistance levels\n"
            "3. Volatility assessment (low/medium/high)\n"
            "4. Recommended indicator focus based on current conditions\n"
            "5. Any notable patterns"
        ),
        expected_output="A structured market analysis with trend, levels, volatility, and indicator recommendations.",
        agent=market_analyst,
    )

    design_strategy = Task(
        description=(
            f"Based on the market analysis, design the optimal strategy to achieve: {user_goal}\n\n"
            f"Symbol: {symbol}, Lookback: {lookback}\n\n"
            "You MUST output a JSON object with this EXACT structure:\n"
            "{\n"
            '  "strategy_name": "descriptive name",\n'
            '  "strategy_type": "trend_following|mean_reversion|momentum|breakout",\n'
            '  "entry_rules": [\n'
            '    {"indicator": "sma|ema|rsi|macd|macd_signal|bollinger_upper|bollinger_lower|bollinger_mid",\n'
            '     "params": {"period": number},\n'
            '     "operator": "crosses_above|crosses_below|>|<|>=|<=",\n'
            '     "compare_to": {"indicator": "...", "params": {...}} OR {"value": number}}\n'
            "  ],\n"
            '  "exit_rules": [same format as entry_rules],\n'
            '  "entry_logic": "all|any",\n'
            '  "exit_logic": "any|all",\n'
            '  "confidence": 0.0-1.0,\n'
            '  "explanation": "why this strategy fits the goal",\n'
            '  "ambiguities": ["list of any assumptions made"]\n'
            "}\n\n"
            "Use ONLY these indicators: sma, ema, rsi, macd, macd_signal, bollinger_upper, bollinger_lower, bollinger_mid.\n"
            "Output ONLY the JSON. No markdown, no extra text."
        ),
        expected_output="A JSON object with the strategy definition.",
        agent=strategy_architect,
        context=[analyze_market],
    )

    assess_risk = Task(
        description=(
            "Review the proposed strategy JSON and optimize it:\n"
            "1. Verify all indicators and operators are valid\n"
            "2. Check that entry/exit rules are not contradictory\n"
            "3. Ensure the strategy is not overly complex\n"
            "4. Adjust confidence based on your assessment\n\n"
            "Output the FINAL strategy JSON with any improvements. "
            "The output MUST be valid JSON with the same structure as the input. "
            "Output ONLY the JSON object. No markdown, no extra text, no code fences."
        ),
        expected_output="Final optimized strategy JSON ready for backtesting.",
        agent=risk_assessor,
        context=[analyze_market, design_strategy],
    )

    # ── Crew ─────────────────────────────────────────────────────
    crew = Crew(
        agents=[market_analyst, strategy_architect, risk_assessor],
        tasks=[analyze_market, design_strategy, assess_risk],
        process=Process.sequential,
        verbose=False,
    )

    return crew
