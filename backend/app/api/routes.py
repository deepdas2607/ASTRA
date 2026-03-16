"""FastAPI routes for backtests, strategy generation, and health."""
from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.models.strategy import ParseRequest, BacktestRequest
from app.models.result import BacktestResult
from app.agents.supervisor import run_full_pipeline
from app.agents.generator import generate_and_backtest
from app.agents.pinescript_generator import generate_pinescript
from app.core.auth import get_current_user, require_user
from app.core.database import execute_one, execute_query

router = APIRouter()

# In-memory store for results (fallback for unauthenticated requests)
_results: dict[str, BacktestResult] = {}


class GenerateRequest(BaseModel):
    """Request to generate an optimal strategy via CrewAI."""
    goal: str
    symbol: str = "AAPL"
    lookback: str = "2y"

class ProductionCodeRequest(BaseModel):
    """Request to translate strategy into PineScript v5."""
    strategy_rules: dict
    symbol: str


def _save_backtest_to_db(result: BacktestResult, user_id: str, strategy_text: str):
    """Save a strategy + backtest result to NeonDB, linked to user."""
    try:
        # Insert strategy
        strategy = execute_one(
            """INSERT INTO strategies (user_id, symbol, timeframe, natural_language_input, parsed_rules, status)
               VALUES (%s::uuid, %s, %s, %s, %s::jsonb, %s)
               RETURNING id""",
            (
                user_id,
                result.symbol,
                result.timeframe,
                strategy_text,
                json.dumps({
                    "strategy_name": result.strategy_name,
                    "explanation": result.explanation,
                    "strategy_type": result.strategy_type,
                    "confidence": result.confidence,
                }),
                result.status,
            ),
        )
        strategy_id = strategy["id"]

        # Insert backtest
        execute_one(
            """INSERT INTO backtests (strategy_id, sharpe_ratio, sortino_ratio, max_drawdown,
               win_rate, total_return, benchmark_return, equity_curve, drawdown_curve, trades,
               duration_ms)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
               RETURNING id""",
            (
                strategy_id,
                result.metrics.sharpe_ratio,
                result.metrics.sortino_ratio,
                result.metrics.max_drawdown,
                result.metrics.win_rate,
                result.metrics.total_return,
                result.metrics.benchmark_return,
                json.dumps(result.equity_curve),
                json.dumps(result.drawdown_curve),
                json.dumps([t.model_dump() for t in result.trades]),
                result.duration_ms,
            ),
        )
    except Exception as e:
        print(f"[DB] Failed to save backtest: {e}")


@router.post("/api/backtest", response_model=BacktestResult)
async def create_backtest(req: BacktestRequest, user=Depends(get_current_user)):
    """Run the full agentic pipeline and return results."""
    parse_req = ParseRequest(
        strategy_text=req.strategy_text,
        symbol=req.symbol,
        timeframe=req.timeframe,
        lookback=req.lookback,
        macro_shield_enabled=req.macro_shield_enabled,
    )
    result = run_full_pipeline(parse_req)

    _results[result.run_id] = result

    # Save to DB if user is authenticated
    if user:
        _save_backtest_to_db(result, user["user_id"], req.strategy_text)

    return result


@router.post("/api/generate", response_model=BacktestResult)
async def generate_strategy(req: GenerateRequest, user=Depends(get_current_user)):
    """Generate an optimal strategy via CrewAI agents and backtest it."""
    result = generate_and_backtest(
        goal=req.goal,
        symbol=req.symbol,
        lookback=req.lookback,
    )
    _results[result.run_id] = result

    # Save to DB if user is authenticated
    if user:
        _save_backtest_to_db(result, user["user_id"], req.goal)

    return result


@router.post("/api/generate-production-code")
async def generate_production_code(req: ProductionCodeRequest):
    """Generate TradingView PineScript v5 from backtested strategy rules."""
    try:
        code = await generate_pinescript(req.strategy_rules, req.symbol)
        return {"code": code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate code: {str(e)}")


@router.get("/api/backtest/{run_id}", response_model=BacktestResult)
async def get_backtest(run_id: str):
    """Retrieve a previous backtest result."""
    if run_id not in _results:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _results[run_id]


@router.get("/api/backtests")
async def list_user_backtests(user=Depends(require_user)):
    """List all backtests for the current user."""
    rows = execute_query(
        """SELECT s.id as strategy_id, s.symbol, s.timeframe, s.natural_language_input,
                  s.status, s.created_at as strategy_created_at,
                  b.id as backtest_id, b.sharpe_ratio, b.sortino_ratio, b.max_drawdown,
                  b.win_rate, b.total_return, b.benchmark_return, b.duration_ms,
                  b.created_at as backtest_created_at
           FROM strategies s
           JOIN backtests b ON b.strategy_id = s.id
           WHERE s.user_id = %s::uuid
           ORDER BY b.created_at DESC
           LIMIT 50""",
        (user["user_id"],),
    )
    return [
        {
            "strategy_id": str(r["strategy_id"]),
            "backtest_id": str(r["backtest_id"]),
            "symbol": r["symbol"],
            "timeframe": r["timeframe"],
            "strategy_text": r["natural_language_input"],
            "status": r["status"],
            "sharpe_ratio": r["sharpe_ratio"],
            "sortino_ratio": r["sortino_ratio"],
            "max_drawdown": r["max_drawdown"],
            "win_rate": r["win_rate"],
            "total_return": r["total_return"],
            "benchmark_return": r["benchmark_return"],
            "duration_ms": r["duration_ms"],
            "created_at": str(r["backtest_created_at"]),
        }
        for r in rows
    ]


@router.get("/api/leaderboard")
async def get_leaderboard():
    """Fetch the global leaderboard."""
    rows = execute_query(
        """SELECT l.*, u.full_name, u.email
           FROM leaderboard l
           LEFT JOIN strategies s ON l.strategy_id = s.id
           LEFT JOIN users u ON s.user_id = u.id
           ORDER BY l.score DESC
           LIMIT 50""",
    )
    return [
        {
            "rank": r.get("rank_num"),
            "strategy_name": r.get("strategy_name"),
            "symbol": r["symbol"],
            "score": r["score"],
            "sharpe_ratio": r.get("sharpe_ratio"),
            "total_return": r.get("total_return"),
            "user_name": r.get("full_name", "Anonymous"),
            "created_at": str(r.get("created_at")),
        }
        for r in rows
    ]


@router.get("/api/health")
async def health():
    """Health check endpoint."""
    from app.core.config import settings
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "llm_configured": bool(settings.GROQ_API_KEY),
    }
