"use client";

import { useState, useEffect, Suspense, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import MinimalBackground from "@/components/MinimalBackground";
import { getToken, getUser, isAuthenticated, logout } from "@/lib/auth";

const PipelineFlow = dynamic(() => import("../components/PipelineFlow"), { ssr: false });
const VoicePanel = dynamic(() => import("@/components/VoicePanel"), { ssr: false });
import Link from "next/link";
import { useRef } from "react";
import { TearsheetPdf } from "../components/TearsheetPdf";
import DeploymentCard from "@/components/DeploymentCard";
import {

  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────

interface Trade {
  trade_number: number;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  duration_days: number;
  return_pct: number;
  pnl: number;
  cumulative_return: number;
}

interface Metrics {
  total_return: number;
  annualized_return: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  win_rate: number;
  trade_count: number;
  avg_trade_return: number;
  profit_factor: number;
  avg_trade_duration: number;
  benchmark_return: number;
  alpha: number;
}

interface AgentLog {
  agent_name: string;
  status: string;
  duration_ms: number;
  summary: string;
}

interface BacktestResult {
  run_id: string;
  strategy_name: string;
  symbol: string;
  timeframe: string;
  lookback: string;
  benchmark: string;
  explanation: string;
  strategy_type: string;
  parsed_rules?: any;
  confidence: number;
  ambiguities: string[];
  metrics: Metrics;
  trades: Trade[];
  signals: { date: string; type: string; price: number }[];
  equity_curve: { date: string; equity: number }[];
  drawdown_curve: { date: string; drawdown: number }[];
  price_series: { date: string; close: number }[];
  benchmark_series: { date: string; close: number }[];
  risk_warnings: { code: string; message: string }[];
  insights: { message: string }[];
  agent_logs: AgentLog[];
  macro_shield_report: {
    total_events: number;
    shocks_detected: number;
    bars_gated_cooloff: number;
    bars_gated_shock: number;
    bars_gated_volatility: number;
    total_bars_gated: number;
    protective_mode_activations: number;
    events_by_importance: { HIGH: number; MEDIUM: number; LOW: number };
    shock_events: { date: string; name: string; actual: number; consensus: number; delta: number }[];
  };
  status: string;
  error: string | null;
  duration_ms: number;
}

// ── Constants ────────────────────────────────────────────────────

const QUICK_STRATEGIES = [
  { label: "Golden Cross", text: "Buy when 50-day SMA crosses above 200-day SMA, sell when RSI exceeds 70", icon: "📈" },
  { label: "RSI Reversal", text: "Buy when RSI drops below 30, sell when RSI goes above 70", icon: "🔄" },
  { label: "MACD Crossover", text: "Buy when MACD line crosses above signal line, sell when MACD crosses below signal", icon: "⚡" },
  { label: "Bollinger Bounce", text: "Buy when price drops below lower Bollinger Band, sell when it crosses above the middle band", icon: "🎯" },
  { label: "EMA Momentum", text: "Buy when 9-day EMA crosses above 21-day EMA and RSI is above 50, sell when 9-day EMA crosses below 21-day EMA", icon: "🚀" },
  { label: "Mean Reversion", text: "Buy when RSI drops below 25 and price is below lower Bollinger Band, sell when RSI exceeds 60", icon: "↩️" },
];

const INDICATORS = [
  "SMA", "EMA", "RSI", "MACD", "MACD Signal", "MACD Histogram",
  "Bollinger Upper", "Bollinger Lower", "Bollinger Mid", "VWAP",
];

const QUICK_GOALS = [
  { label: "Maximize Returns", text: "Maximize returns on this stock with aggressive momentum trading", icon: "🚀" },
  { label: "Low Drawdown", text: "Generate a conservative strategy that minimizes drawdown while maintaining steady returns", icon: "🛡️" },
  { label: "Trend Following", text: "Create a trend-following strategy that catches major price moves and avoids whipsaws", icon: "📈" },
  { label: "Mean Reversion", text: "Design a mean-reversion strategy that buys oversold conditions and sells overbought", icon: "↩️" },
  { label: "Swing Trading", text: "Build a swing trading strategy with 5-15 day holding periods", icon: "🎯" },
  { label: "Momentum Breakout", text: "Create a breakout strategy that enters on strong upward momentum with tight risk management", icon: "⚡" },
];

const AGENT_PIPELINE = [
  { name: "Parser", role: "LLM Translation", color: "#00e5ff", icon: "🧠" },
  { name: "Reasoning", role: "Validation", color: "#c6ff00", icon: "🔍" },
  { name: "Compiler", role: "Signal Gen", color: "#ff9100", icon: "⚙️" },
  { name: "Execution", role: "Simulation", color: "#00e676", icon: "▶️" },
  { name: "Analytics", role: "Metrics", color: "#b388ff", icon: "📊" },
];

// ── Main Dashboard ───────────────────────────────────────────────

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefilled = searchParams.get("strategy") || "";

  const [strategy, setStrategy] = useState(prefilled);
  const [goal, setGoal] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [lookback, setLookback] = useState("2y");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"backtest" | "generate" | "voice">("backtest");
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [macroShieldEnabled, setMacroShieldEnabled] = useState(true);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    if (prefilled) setStrategy(prefilled);
  }, [prefilled]);

  useEffect(() => {
    const u = getUser();
    setUser(u);
  }, []);

  const downloadPdf = async () => {
    if (!pdfRef.current || !result) return;
    setIsPdfGenerating(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "pt", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Astra_Tearsheet_${result.run_id}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const runBacktest = async () => {
    if (!strategy.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setActiveAgentIdx(0);

    const agentTimers = [600, 400, 300, 1200, 500];
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx < agentTimers.length) setActiveAgentIdx(idx);
    }, agentTimers[idx] || 600);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/backtest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ strategy_text: strategy, symbol, timeframe: "1d", lookback, macro_shield_enabled: macroShieldEnabled }),
      });
      const data: BacktestResult = await res.json();
      clearInterval(interval);
      setActiveAgentIdx(5);
      if (data.status === "failed") setError(data.error || "Backtest failed");
      setResult(data);
    } catch (e: any) {
      clearInterval(interval);
      setError(e.message || "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  const runGenerate = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setActiveAgentIdx(0);

    // Longer timers for CrewAI (3 agents + compile + backtest)
    const agentTimers = [2000, 3000, 2000, 500, 1000, 500];
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx < agentTimers.length) setActiveAgentIdx(idx);
    }, agentTimers[idx] || 2000);

    try {
      const gHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const gToken = getToken();
      if (gToken) gHeaders["Authorization"] = `Bearer ${gToken}`;
      const res = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: gHeaders,
        body: JSON.stringify({ goal, symbol, lookback }),
      });
      const data: BacktestResult = await res.json();
      clearInterval(interval);
      setActiveAgentIdx(7);
      if (data.status === "failed") setError(data.error || "Generation failed");
      setResult(data);
    } catch (e: any) {
      clearInterval(interval);
      setError(e.message || "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Background Animation */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <MinimalBackground />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            background: "radial-gradient(circle at 50% 50%, transparent 0%, var(--bg-primary) 100%)",
            opacity: 0.8
          }}
        />
      </div>

      <div className="relative z-10">
        {/* ── Topbar ─────────────────────────────────────────── */}
        <nav
          className="fixed top-0 w-full z-50 flex items-center justify-between px-6 py-3"
          style={{ background: "rgba(10,10,10,0.92)", borderBottom: "3px solid #1a1a1a", backdropFilter: "blur(12px)" }}
        >
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div
              className="w-8 h-8 flex items-center justify-center font-bold text-xs"
              style={{ background: "var(--accent-cyan)", color: "#000", border: "2px solid #000", boxShadow: "3px 3px 0px #000" }}
            >
              AS
            </div>
            <span className="font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Astra<span style={{ color: "var(--accent-cyan)" }}>.AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {/* Live pipeline mini-indicators in navbar */}
            <div className="hidden md:flex items-center gap-1.5">
              {AGENT_PIPELINE.map((a, i) => (
                <div
                  key={i}
                  className="w-2 h-2"
                  title={a.name}
                  style={{
                    background: loading && i === activeAgentIdx ? a.color
                      : loading && i < activeAgentIdx ? a.color + "88"
                        : result ? a.color + "66"
                          : "#333",
                    border: `1px solid ${loading && i <= activeAgentIdx ? a.color : "#444"}`,
                    animation: loading && i === activeAgentIdx ? "pulse 1s infinite" : "none",
                    transition: "all 0.3s",
                  }}
                />
              ))}
            </div>
            <span className="nb-tag nb-tag-lime">Engine v1.0</span>
            {user ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 flex items-center justify-center font-bold text-[0.6rem] uppercase"
                  style={{
                    background: user.avatar_url ? "transparent" : "var(--accent-purple)",
                    color: "#000",
                    border: "2px solid #000",
                    overflow: "hidden",
                  }}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.full_name?.[0] || user.email[0]
                  )}
                </div>
                <button
                  onClick={logout}
                  className="mono text-[0.6rem] px-2 py-1 cursor-pointer"
                  style={{ color: "var(--text-muted)", border: "1px solid #333", background: "var(--bg-card)" }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link href="/login">
                <button className="nb-btn nb-btn-primary text-xs py-1.5 px-4">Login</button>
              </Link>
            )}
          </div>
        </nav>

        {/* ── Main content ───────────────────────────────────── */}
        <div className="pt-20 px-4 md:px-6 pb-16 max-w-7xl mx-auto">

          {/* ── Header with stickers ─────────────────────────── */}
          <div className="mb-8 pt-4">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold">Strategy Engine</h1>
              <div className="nb-sticker" style={{ borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "#00e5ff0a" }}>
                ⚡ AI-Powered
              </div>
              <div className="nb-sticker" style={{ borderColor: "var(--accent-lime)", color: "var(--accent-lime)", background: "#c6ff000a", transform: "rotate(1deg)" }}>
                {mode === "generate" ? "CrewAI" : "6 Agents"}
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {mode === "voice"
                ? "Talk to Astra — your AI trading advisor. Discuss strategies, ask questions, or describe your trading goals using your voice."
                : mode === "generate"
                  ? "Describe your trading goal. Our CrewAI agents (Market Analyst → Strategy Architect → Risk Assessor) will design and backtest the optimal strategy."
                  : "Describe your trading strategy in natural language. Our agentic pipeline handles parsing, validation, compilation, simulation, and analysis."}
            </p>
          </div>

          {/* ── Mode Toggle ──────────────────────────────────── */}
          <div className="flex gap-2 mb-6">
            <button
              className="nb-btn text-sm py-2.5 px-5 flex-1 md:flex-none"
              style={{
                background: mode === "backtest" ? "var(--accent-cyan)" : "var(--bg-card)",
                color: mode === "backtest" ? "#000" : "var(--text-secondary)",
                border: `3px solid ${mode === "backtest" ? "var(--accent-cyan)" : "#333"}`,
                fontWeight: 700,
                boxShadow: mode === "backtest" ? "4px 4px 0px #000" : "none",
              }}
              onClick={() => { setMode("backtest"); setResult(null); setError(""); }}
            >
              📝 Backtest Strategy
            </button>
            <button
              className="nb-btn text-sm py-2.5 px-5 flex-1 md:flex-none"
              style={{
                background: mode === "generate" ? "var(--accent-lime)" : "var(--bg-card)",
                color: mode === "generate" ? "#000" : "var(--text-secondary)",
                border: `3px solid ${mode === "generate" ? "var(--accent-lime)" : "#333"}`,
                fontWeight: 700,
                boxShadow: mode === "generate" ? "4px 4px 0px #000" : "none",
              }}
              onClick={() => { setMode("generate"); setResult(null); setError(""); }}
            >
              🤖 Generate Strategy
            </button>
            <button
              className="nb-btn text-sm py-2.5 px-5 flex-1 md:flex-none"
              style={{
                background: mode === "voice" ? "var(--accent-purple)" : "var(--bg-card)",
                color: mode === "voice" ? "#000" : "var(--text-secondary)",
                border: `3px solid ${mode === "voice" ? "var(--accent-purple)" : "#333"}`,
                fontWeight: 700,
                boxShadow: mode === "voice" ? "4px 4px 0px #000" : "none",
              }}
              onClick={() => { setMode("voice"); setResult(null); setError(""); }}
            >
              🎙️ Voice Mode
            </button>
          </div>

          {/* ── Voice Mode ──────────────────────────────────── */}
          {mode === "voice" && (
            <div className="mb-6">
              <VoicePanel />
            </div>
          )}

          {/* ── Strategy Input (Backtest Mode) ──────────────── */}
          {mode === "backtest" && (
            <div className="grid lg:grid-cols-[1fr_340px] gap-5 mb-6">
              {/* Strategy textarea */}
              <div className="relative">
                <div
                  className="absolute -top-3 left-4 px-2 mono text-[0.65rem] font-bold uppercase tracking-widest z-10"
                  style={{ background: "var(--bg-primary)", color: "var(--accent-cyan)" }}
                >
                  Strategy Input
                </div>
                <textarea
                  className="nb-textarea"
                  style={{ minHeight: "160px", fontSize: "0.95rem", lineHeight: "1.7", paddingTop: "1.5rem" }}
                  placeholder='Type your strategy here...e.g. "Buy when 50-day SMA crosses above 200-day SMA, sell when RSI exceeds 70"'
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                />
                {strategy && (
                  <button
                    className="absolute top-4 right-4 text-xs mono px-2 py-1 cursor-pointer"
                    style={{ color: "var(--text-muted)", border: "1px solid #333", background: "var(--bg-card)" }}
                    onClick={() => setStrategy("")}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Config panel */}
              <div
                className="p-5 flex flex-col gap-4 relative"
                style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg, var(--accent-cyan), var(--accent-lime), var(--accent-orange))" }} />

                <div>
                  <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                    Ticker Symbol
                  </label>
                  <input
                    className="nb-input"
                    style={{ padding: "0.65rem 0.8rem", fontSize: "0.85rem" }}
                    placeholder="AAPL, TCS.NS, BTC-USD"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  />
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {["AAPL", "TSLA", "TCS.NS", "BTC-USD"].map((s) => (
                      <button
                        key={s}
                        className="mono text-[0.6rem] px-2 py-0.5 cursor-pointer"
                        style={{
                          border: `1px solid ${symbol === s ? "var(--accent-cyan)" : "#333"}`,
                          color: symbol === s ? "var(--accent-cyan)" : "var(--text-muted)",
                          background: symbol === s ? "#00e5ff0a" : "transparent",
                        }}
                        onClick={() => setSymbol(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                    Lookback Period
                  </label>
                  <div className="flex gap-2 w-full pr-[5px] pb-[5px]">
                    {["6mo", "1y", "2y", "5y"].map((lb) => (
                      <button
                        key={lb}
                        className={`nb-btn text-xs py-2 px-3 flex-1 ${lookback === lb ? "nb-btn-primary" : "nb-btn-secondary"}`}
                        onClick={() => setLookback(lb)}
                      >
                        {lb}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Macro-Shield Toggle */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <label className="block text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-secondary)" }}>
                        🛡️ Macro-Shield
                      </label>
                      <div className="relative group">
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[0.55rem] font-bold cursor-help"
                          style={{ background: "#252525", color: "var(--text-muted)", border: "1px solid #444" }}
                        >
                          i
                        </span>
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 text-[0.65rem] leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-50"
                          style={{ background: "#1a1a1a", border: "2px solid #333", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", color: "var(--text-secondary)" }}
                        >
                          <div className="font-bold mb-1" style={{ color: "#ff1744" }}>Macro-Shield</div>
                          Protects your strategy from macro-economic shocks. It blocks buy signals during high-impact events (NFP, CPI, FOMC), detects market shocks, and pauses execution during extreme volatility spikes.
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #333" }} />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setMacroShieldEnabled(!macroShieldEnabled)}
                      className="relative w-11 h-6 rounded-full transition-all duration-200 cursor-pointer"
                      style={{
                        background: macroShieldEnabled ? "#ff1744" : "#333",
                        border: `2px solid ${macroShieldEnabled ? "#ff1744" : "#555"}`,
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                        style={{
                          background: macroShieldEnabled ? "#fff" : "#888",
                          left: macroShieldEnabled ? "22px" : "2px",
                        }}
                      />
                    </button>
                  </div>
                  <p className="text-[0.6rem] mt-1" style={{ color: "var(--text-muted)" }}>
                    {macroShieldEnabled ? "Event safety gating active" : "Shield disabled — raw signals"}
                  </p>
                </div>

                <button
                  className="nb-btn nb-btn-lime w-full py-3.5 mt-auto text-base relative overflow-hidden"
                  onClick={runBacktest}
                  disabled={loading || !strategy.trim()}
                  style={{ opacity: loading || !strategy.trim() ? 0.5 : 1, cursor: loading ? "wait" : "pointer" }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-3 h-3" style={{ border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%", animation: "pulse 0.6s linear infinite" }} />
                      Running Pipeline...
                    </span>
                  ) : (
                    "▶ Run Backtest"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Goal Input (Generate Mode) ────────────────────── */}
          {mode === "generate" && (
            <div className="grid lg:grid-cols-[1fr_340px] gap-5 mb-6">
              {/* Goal textarea */}
              <div className="relative">
                <div
                  className="absolute -top-3 left-4 px-2 mono text-[0.65rem] font-bold uppercase tracking-widest z-10"
                  style={{ background: "var(--bg-primary)", color: "var(--accent-lime)" }}
                >
                  Trading Objective
                </div>
                <textarea
                  className="nb-textarea"
                  style={{ minHeight: "160px", fontSize: "0.95rem", lineHeight: "1.7", paddingTop: "1.5rem", borderColor: "var(--accent-lime)" }}
                  placeholder='Describe your trading goal...e.g. "Maximize returns with aggressive momentum trading and low drawdown"'
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
                {goal && (
                  <button
                    className="absolute top-4 right-4 text-xs mono px-2 py-1 cursor-pointer"
                    style={{ color: "var(--text-muted)", border: "1px solid #333", background: "var(--bg-card)" }}
                    onClick={() => setGoal("")}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Config panel */}
              <div
                className="p-5 flex flex-col gap-4 relative"
                style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg, var(--accent-lime), var(--accent-cyan), var(--accent-purple))" }} />

                <div className="p-3" style={{ background: "#c6ff000a", border: "1px solid #c6ff0033" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--accent-lime)" }}>🤖 CrewAI Agents</div>
                  <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
                    3 AI agents collaborate to build your strategy:
                    <br />Market Analyst → Strategy Architect → Risk Assessor
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                    Ticker Symbol
                  </label>
                  <input
                    className="nb-input"
                    style={{ padding: "0.65rem 0.8rem", fontSize: "0.85rem" }}
                    placeholder="AAPL, TCS.NS, BTC-USD"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  />
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {["AAPL", "TSLA", "TCS.NS", "BTC-USD"].map((s) => (
                      <button
                        key={s}
                        className="mono text-[0.6rem] px-2 py-0.5 cursor-pointer"
                        style={{
                          border: `1px solid ${symbol === s ? "var(--accent-lime)" : "#333"}`,
                          color: symbol === s ? "var(--accent-lime)" : "var(--text-muted)",
                          background: symbol === s ? "#c6ff000a" : "transparent",
                        }}
                        onClick={() => setSymbol(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                    Lookback Period
                  </label>
                  <div className="flex gap-2 w-full pr-[5px] pb-[5px]">
                    {["6mo", "1y", "2y", "5y"].map((lb) => (
                      <button
                        key={lb}
                        className={`nb-btn text-xs py-2 px-3 flex-1 ${lookback === lb ? "nb-btn-primary" : "nb-btn-secondary"}`}
                        onClick={() => setLookback(lb)}
                      >
                        {lb}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="nb-btn w-full py-3.5 mt-auto text-base relative overflow-hidden"
                  style={{
                    background: "var(--accent-lime)",
                    color: "#000",
                    border: "3px solid #000",
                    boxShadow: "4px 4px 0px #000",
                    fontWeight: 700,
                    opacity: loading || !goal.trim() ? 0.5 : 1,
                    cursor: loading ? "wait" : "pointer",
                  }}
                  onClick={runGenerate}
                  disabled={loading || !goal.trim()}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-3 h-3" style={{ border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%", animation: "pulse 0.6s linear infinite" }} />
                      AI Generating...
                    </span>
                  ) : (
                    "🤖 Generate & Backtest"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Quick-pick strategies (Backtest mode) ──────── */}
          {mode === "backtest" && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                  Quick Pick
                </span>
                <div style={{ flex: 1, height: "1px", background: "#222" }} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 stagger-in">
                {QUICK_STRATEGIES.map((qs, i) => (
                  <button
                    key={i}
                    onClick={() => setStrategy(qs.text)}
                    className="text-left p-3 cursor-pointer group"
                    style={{
                      background: strategy === qs.text ? "#00e5ff08" : "var(--bg-card)",
                      border: strategy === qs.text ? "2px solid var(--accent-cyan)" : "2px solid #252525",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent-cyan)"; (e.target as HTMLElement).style.transform = "translate(-2px, -2px)"; (e.target as HTMLElement).style.boxShadow = "4px 4px 0px #000"; }}
                    onMouseLeave={(e) => { if (strategy !== qs.text) { (e.target as HTMLElement).style.borderColor = "#252525"; } (e.target as HTMLElement).style.transform = "none"; (e.target as HTMLElement).style.boxShadow = "none"; }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{qs.icon}</span>
                      <span className="font-bold text-xs">{qs.label}</span>
                    </div>
                    <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {qs.text.length > 80 ? qs.text.slice(0, 80) + "..." : qs.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick-pick goals (Generate mode) ────────────── */}
          {mode === "generate" && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                  Quick Goals
                </span>
                <div style={{ flex: 1, height: "1px", background: "#222" }} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 stagger-in">
                {QUICK_GOALS.map((qg, i) => (
                  <button
                    key={i}
                    onClick={() => setGoal(qg.text)}
                    className="text-left p-3 cursor-pointer group"
                    style={{
                      background: goal === qg.text ? "#c6ff0008" : "var(--bg-card)",
                      border: goal === qg.text ? "2px solid var(--accent-lime)" : "2px solid #252525",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent-lime)"; (e.target as HTMLElement).style.transform = "translate(-2px, -2px)"; (e.target as HTMLElement).style.boxShadow = "4px 4px 0px #000"; }}
                    onMouseLeave={(e) => { if (goal !== qg.text) { (e.target as HTMLElement).style.borderColor = "#252525"; } (e.target as HTMLElement).style.transform = "none"; (e.target as HTMLElement).style.boxShadow = "none"; }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{qg.icon}</span>
                      <span className="font-bold text-xs">{qg.label}</span>
                    </div>
                    <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {qg.text.length > 80 ? qg.text.slice(0, 80) + "..." : qg.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Agent Pipeline (always visible) ─────────────── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                Agent Pipeline
              </span>
              <div style={{ flex: 1, height: "1px", background: "#222" }} />
              {result && (
                <span className="mono text-[0.65rem]" style={{ color: "var(--accent-green)" }}>
                  ✓ Completed in {result.duration_ms}ms
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap md:flex-nowrap">
              {AGENT_PIPELINE.map((agent, i) => {
                const isActive = loading && i === activeAgentIdx;
                const isComplete = result ? true : loading && i < activeAgentIdx;
                const log = result?.agent_logs?.[i];

                return (
                  <div key={i} className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <div
                      className="flex-1 p-3 relative overflow-hidden"
                      style={{
                        background: isActive ? `${agent.color}08` : "var(--bg-card)",
                        border: `3px solid ${isActive ? agent.color : isComplete ? agent.color + "55" : "#252525"}`,
                        boxShadow: isActive ? `0 0 16px ${agent.color}22` : "none",
                        transition: "all 0.3s ease",
                      }}
                    >
                      {isActive && (
                        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: agent.color, animation: "pulse 1s infinite" }} />
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{agent.icon}</span>
                        <span className="font-bold text-xs">{agent.name}</span>
                        <div
                          className="w-2 h-2 ml-auto"
                          style={{
                            background: isComplete ? agent.color : isActive ? agent.color : "#333",
                            border: `1.5px solid ${isComplete || isActive ? agent.color : "#444"}`,
                            animation: isActive ? "pulse 1s infinite" : "none",
                          }}
                        />
                      </div>
                      <div className="mono text-[0.6rem]" style={{ color: isComplete ? agent.color + "aa" : "var(--text-muted)" }}>
                        {log ? `${log.duration_ms}ms` : agent.role}
                      </div>
                      {log?.summary && (
                        <div className="text-[0.6rem] mt-1 leading-tight" style={{ color: "var(--text-secondary)" }}>
                          {log.summary.length > 50 ? log.summary.slice(0, 50) + "…" : log.summary}
                        </div>
                      )}
                    </div>
                    {i < AGENT_PIPELINE.length - 1 && (
                      <div className="hidden md:block text-xs" style={{ color: isComplete ? agent.color : "#333" }}>→</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Supported Indicators ────────────────────────── */}
          {!result && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                  Supported Indicators
                </span>
                <div style={{ flex: 1, height: "1px", background: "#222" }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {INDICATORS.map((ind) => (
                  <span key={ind} className="indicator-chip">{ind}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Feature cards (when no result shown) ────────── */}
          {!result && !loading && (
            <div className="grid md:grid-cols-3 gap-4 mb-8 stagger-in">
              {[
                { title: "Natural Language Parsing", desc: "Describe complex strategies in plain English. No code needed.", color: "var(--accent-cyan)", icon: "🧠" },
                { title: "Realistic Simulation", desc: "Commission, slippage, and lookahead bias protection built in.", color: "var(--accent-lime)", icon: "⚙️" },
                { title: "Performance Tearsheet", desc: "Sharpe, Sortino, drawdown, win rate, alpha, equity curves.", color: "var(--accent-purple)", icon: "📊" },
              ].map((f, i) => (
                <div
                  key={i}
                  className="p-4 relative overflow-hidden"
                  style={{ background: "var(--bg-card)", border: "3px solid #252525", boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ background: f.color }} />
                  <div className="text-xl mb-2">{f.icon}</div>
                  <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Error ────────────────────────────────────────── */}
          {error && (
            <div
              className="mb-8 p-4 animate-slide-in"
              style={{ background: "var(--bg-card)", border: "3px solid var(--accent-red)", borderLeft: "6px solid var(--accent-red)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="font-bold text-sm mb-1" style={{ color: "var(--accent-red)" }}>✕ Pipeline Error</div>
              <p className="text-sm mono" style={{ color: "var(--text-secondary)" }}>{error}</p>
            </div>
          )}

          {/* ── Results ──────────────────────────────────────── */}
          {result && result.status === "completed" && (
            <div className="animate-slide-in">
              {/* Strategy explanation */}
              <div className="nb-divider mb-6" />
              <div className="mb-6 p-5 relative overflow-hidden" style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}>
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg, var(--accent-cyan), var(--accent-lime))" }} />
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h2 className="font-bold text-xl">{result.strategy_name}</h2>
                  {result.strategy_type && <span className="nb-tag nb-tag-cyan">{result.strategy_type}</span>}
                  <span className="nb-tag nb-tag-lime">{result.symbol}</span>
                  <span className="nb-tag nb-tag-orange">{result.lookback}</span>
                  {result.confidence > 0 && (
                    <span className="mono text-xs" style={{ color: result.confidence > 0.8 ? "var(--accent-green)" : "var(--accent-orange)" }}>
                      {(result.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                {result.explanation && (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {result.explanation}
                  </p>
                )}
                {result.ambiguities.length > 0 && (
                  <div className="mt-3 p-2" style={{ background: "#ff910008", border: "1px solid #ff910033" }}>
                    {result.ambiguities.map((a, i) => (
                      <div key={i} className="text-xs mono" style={{ color: "var(--accent-orange)" }}>⚠ {a}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Metrics Grid ──────────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6 stagger-in">
                {[
                  { label: "Total Return", value: `${result.metrics.total_return}%`, color: result.metrics.total_return >= 0 ? "var(--accent-green)" : "var(--accent-red)" },
                  { label: "Sharpe Ratio", value: result.metrics.sharpe_ratio.toFixed(2), color: result.metrics.sharpe_ratio >= 1 ? "var(--accent-green)" : "var(--accent-orange)" },
                  { label: "Max Drawdown", value: `${result.metrics.max_drawdown}%`, color: result.metrics.max_drawdown > 25 ? "var(--accent-red)" : "var(--accent-orange)" },
                  { label: "Win Rate", value: `${result.metrics.win_rate}%`, color: result.metrics.win_rate >= 50 ? "var(--accent-green)" : "var(--accent-orange)" },
                  { label: "Trades", value: String(result.metrics.trade_count), color: "var(--accent-cyan)" },
                  { label: "Alpha", value: `${result.metrics.alpha}%`, color: result.metrics.alpha >= 0 ? "var(--accent-lime)" : "var(--accent-red)" },
                  { label: "Annualized", value: `${result.metrics.annualized_return}%`, color: result.metrics.annualized_return >= 0 ? "var(--accent-green)" : "var(--accent-red)" },
                  { label: "Sortino", value: result.metrics.sortino_ratio.toFixed(2), color: "var(--accent-purple)" },
                  { label: "Profit Factor", value: result.metrics.profit_factor.toFixed(2), color: result.metrics.profit_factor >= 1 ? "var(--accent-green)" : "var(--accent-red)" },
                  { label: "Avg Return", value: `${result.metrics.avg_trade_return}%`, color: "var(--text-primary)" },
                  { label: "Avg Duration", value: `${result.metrics.avg_trade_duration}d`, color: "var(--text-primary)" },
                  { label: "Benchmark", value: `${result.metrics.benchmark_return}%`, color: "var(--text-secondary)" },
                ].map((m, i) => (
                  <div key={i} className="metric-box">
                    <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
                    <div className="metric-label">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Charts ────────────────────────────────────── */}
              <div className="grid lg:grid-cols-2 gap-5 mb-6">
                {/* Equity Curve */}
                <div className="p-4 relative overflow-hidden" style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}>
                  <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: "var(--accent-cyan)" }} />
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 inline-block" style={{ background: "var(--accent-cyan)", border: "2px solid #000" }} />
                    Equity Curve
                  </h3>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={result.equity_curve}>
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                        <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => v?.slice(5, 10)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: "#1a1a1a", border: "3px solid #333", fontFamily: "JetBrains Mono", fontSize: 11, boxShadow: "4px 4px 0px #000" }} />
                        <Area type="monotone" dataKey="equity" stroke="#00e5ff" strokeWidth={2} fill="url(#eqGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Drawdown Curve */}
                <div className="p-4 relative overflow-hidden" style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}>
                  <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: "var(--accent-red)" }} />
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 inline-block" style={{ background: "var(--accent-red)", border: "2px solid #000" }} />
                    Drawdown
                  </h3>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={result.drawdown_curve}>
                        <defs>
                          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff1744" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#ff1744" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                        <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => v?.slice(5, 10)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => `${v}%`} reversed />
                        <Tooltip contentStyle={{ background: "#1a1a1a", border: "3px solid #333", fontFamily: "JetBrains Mono", fontSize: 11, boxShadow: "4px 4px 0px #000" }} />
                        <Area type="monotone" dataKey="drawdown" stroke="#ff1744" strokeWidth={2} fill="url(#ddGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── Price chart with signals ──────────────────── */}
              {result.price_series.length > 0 && (
                <div className="p-4 mb-6 relative overflow-hidden" style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}>
                  <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: "var(--accent-lime)" }} />
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 inline-block" style={{ background: "var(--accent-lime)", border: "2px solid #000" }} />
                    Price — {result.symbol}
                    {result.signals.length > 0 && (
                      <span className="ml-auto flex gap-3 text-xs">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "var(--accent-green)" }} /> {result.signals.filter(s => s.type === "buy").length} buys</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "var(--accent-red)" }} /> {result.signals.filter(s => s.type === "sell").length} sells</span>
                      </span>
                    )}
                  </h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={result.price_series}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                        <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => v?.slice(5, 10)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "#555", fontSize: 10, fontFamily: "JetBrains Mono" }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={{ background: "#1a1a1a", border: "3px solid #333", fontFamily: "JetBrains Mono", fontSize: 11, boxShadow: "4px 4px 0px #000" }} />
                        <Line type="monotone" dataKey="close" stroke="#c6ff00" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ── Risk Warnings & Insights ─────────────────── */}
              <div className="grid lg:grid-cols-2 gap-5 mb-6">
                {result.risk_warnings.length > 0 && (
                  <div className="p-4" style={{ background: "var(--bg-card)", border: "3px solid #ff910044", borderLeft: "6px solid var(--accent-orange)", boxShadow: "var(--shadow-sm)" }}>
                    <h3 className="font-bold text-sm mb-3" style={{ color: "var(--accent-orange)" }}>⚠ Risk Warnings</h3>
                    {result.risk_warnings.map((w, i) => (
                      <div key={i} className="text-sm mb-2 last:mb-0" style={{ color: "var(--text-secondary)" }}>{w.message}</div>
                    ))}
                    <div className="text-[0.6rem] mt-3 mono" style={{ color: "var(--text-muted)" }}>Informational only — not financial advice.</div>
                  </div>
                )}
                {result.insights.length > 0 && (
                  <div className="p-4" style={{ background: "var(--bg-card)", border: "3px solid #00e5ff44", borderLeft: "6px solid var(--accent-cyan)", boxShadow: "var(--shadow-sm)" }}>
                    <h3 className="font-bold text-sm mb-3" style={{ color: "var(--accent-cyan)" }}>✦ Insights</h3>
                    {result.insights.map((ins, i) => (
                      <div key={i} className="text-sm mb-2 last:mb-0" style={{ color: "var(--text-secondary)" }}>{ins.message}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Trade Table ──────────────────────────────── */}
              {result.trades.length > 0 && (
                <div className="p-4 mb-6 overflow-x-auto relative" style={{ background: "var(--bg-card)", border: "3px solid #333", boxShadow: "var(--shadow-md)" }}>
                  <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: "var(--accent-purple)" }} />
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 inline-block" style={{ background: "var(--accent-purple)", border: "2px solid #000" }} />
                    Trade Replay — {result.trades.length} trades
                  </h3>
                  <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["#", "Entry", "Entry $", "Exit", "Exit $", "Days", "Return", "P&L"].map((h) => (
                          <th key={h} className="mono text-[0.65rem] uppercase tracking-wider py-2 px-3" style={{ color: "var(--text-muted)", borderBottom: "3px solid #252525" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t) => (
                        <tr key={t.trade_number} className="group" style={{ borderBottom: "1px solid #1a1a1a" }}>
                          <td className="py-2.5 px-3 mono text-xs font-bold" style={{ color: "var(--accent-cyan)" }}>{t.trade_number}</td>
                          <td className="py-2.5 px-3 mono text-xs">{t.entry_date}</td>
                          <td className="py-2.5 px-3 mono text-xs">{t.entry_price.toLocaleString()}</td>
                          <td className="py-2.5 px-3 mono text-xs">{t.exit_date}</td>
                          <td className="py-2.5 px-3 mono text-xs">{t.exit_price.toLocaleString()}</td>
                          <td className="py-2.5 px-3 mono text-xs">{t.duration_days}</td>
                          <td className="py-2.5 px-3 mono text-xs font-bold" style={{ color: t.return_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                            {t.return_pct >= 0 ? "+" : ""}{t.return_pct}%
                          </td>
                          <td className="py-2.5 px-3 mono text-xs font-bold" style={{ color: t.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                            {t.pnl >= 0 ? "+" : ""}{t.pnl.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Macro-Shield Report ──────────────────────────── */}
              {result.macro_shield_report && result.macro_shield_report.total_events > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                      🛡️ Macro-Shield Report
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "#222" }} />
                    <span className="mono text-[0.65rem]" style={{ color: result.macro_shield_report.total_bars_gated > 0 ? "#ff1744" : "var(--accent-green)" }}>
                      {result.macro_shield_report.total_bars_gated > 0 ? `${result.macro_shield_report.total_bars_gated} signals gated` : "All clear"}
                    </span>
                  </div>

                  {/* Shield Stats Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Events Scanned", value: String(result.macro_shield_report.total_events), color: "var(--accent-cyan)" },
                      { label: "Shocks Detected", value: String(result.macro_shield_report.shocks_detected), color: result.macro_shield_report.shocks_detected > 0 ? "#ff1744" : "var(--accent-green)" },
                      { label: "Cool-off Gates", value: String(result.macro_shield_report.bars_gated_cooloff), color: "var(--accent-orange)" },
                      { label: "Protective Mode", value: String(result.macro_shield_report.protective_mode_activations), color: result.macro_shield_report.protective_mode_activations > 0 ? "#ff1744" : "var(--text-muted)" },
                    ].map((s, i) => (
                      <div key={i} className="metric-box">
                        <div className="metric-value" style={{ color: s.color }}>{s.value}</div>
                        <div className="metric-label">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Event Importance Breakdown */}
                  <div
                    className="p-4 mb-4"
                    style={{ background: "var(--bg-card)", border: "3px solid #252525" }}
                  >
                    <div className="text-xs font-bold mb-3" style={{ color: "var(--text-secondary)" }}>Event Breakdown</div>
                    <div className="flex gap-4">
                      {[
                        { label: "HIGH", count: result.macro_shield_report.events_by_importance.HIGH, color: "#ff1744" },
                        { label: "MEDIUM", count: result.macro_shield_report.events_by_importance.MEDIUM, color: "var(--accent-orange)" },
                        { label: "LOW", count: result.macro_shield_report.events_by_importance.LOW, color: "var(--text-muted)" },
                      ].map((e, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2" style={{ background: e.color }} />
                          <span className="mono text-[0.65rem]" style={{ color: e.color }}>{e.label}: {e.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shock Events Table */}
                  {result.macro_shield_report.shock_events.length > 0 && (
                    <div
                      className="overflow-x-auto"
                      style={{ background: "var(--bg-card)", border: "3px solid #252525" }}
                    >
                      <div className="p-3 flex items-center gap-2" style={{ borderBottom: "2px solid #252525" }}>
                        <span className="text-xs font-bold" style={{ color: "#ff1744" }}>⚡ Shock Events Detected</span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: "2px solid #252525" }}>
                            <th className="py-2 px-3 text-left mono font-bold" style={{ color: "var(--text-muted)" }}>Date</th>
                            <th className="py-2 px-3 text-left mono font-bold" style={{ color: "var(--text-muted)" }}>Event</th>
                            <th className="py-2 px-3 text-right mono font-bold" style={{ color: "var(--text-muted)" }}>Consensus</th>
                            <th className="py-2 px-3 text-right mono font-bold" style={{ color: "var(--text-muted)" }}>Actual</th>
                            <th className="py-2 px-3 text-right mono font-bold" style={{ color: "var(--text-muted)" }}>Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.macro_shield_report.shock_events.map((ev, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
                              <td className="py-2 px-3 mono" style={{ color: "var(--text-secondary)" }}>{ev.date}</td>
                              <td className="py-2 px-3 font-bold" style={{ color: "var(--text-primary)" }}>{ev.name}</td>
                              <td className="py-2 px-3 text-right mono" style={{ color: "var(--text-secondary)" }}>{ev.consensus}</td>
                              <td className="py-2 px-3 text-right mono font-bold" style={{ color: "#ff1744" }}>{ev.actual}</td>
                              <td className="py-2 px-3 text-right mono font-bold" style={{ color: "#ff1744" }}>{ev.delta}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Pipeline Flow Diagram ────────────────────── */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                    Agent Pipeline Flow
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "#222" }} />
                </div>
                <PipelineFlow
                  strategyText={strategy}
                  symbol={result.symbol}
                  lookback={result.lookback}
                  explanation={result.explanation}
                  strategyType={result.strategy_type}
                  confidence={result.confidence}
                  ambiguities={result.ambiguities}
                  metrics={result.metrics}
                  agentLogs={result.agent_logs}
                  signalCount={{
                    buy: result.signals.filter((s) => s.type === "buy").length,
                    sell: result.signals.filter((s) => s.type === "sell").length,
                  }}
                  riskWarnings={result.risk_warnings}
                  insights={result.insights}
                  durationMs={result.duration_ms}
                  status={result.status}
                />
              </div>

              {/* ── Deployment Bridge (Go Live) ──────────────── */}
              <DeploymentCard
                strategyRules={result.parsed_rules || {
                  strategy_name: result.strategy_name,
                  explanation: result.explanation,
                  strategy_type: result.strategy_type
                }}
                symbol={result.symbol || symbol}
              />

              {/* ── Export buttons ────────────────────────────── */}
              <div className="flex gap-3 flex-wrap mt-6 pt-6" style={{ borderTop: "1px solid #222" }}>
                <button className="nb-btn nb-btn-secondary text-xs" onClick={() => {
                  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Astra_${result.run_id}.json`; a.click();
                }}>↓ Export JSON</button>
                <button className="nb-btn nb-btn-secondary text-xs" onClick={() => {
                  const headers = ["#", "Entry Date", "Entry Price", "Exit Date", "Exit Price", "Days", "Return %", "P&L"];
                  const rows = result.trades.map((t) => [t.trade_number, t.entry_date, t.entry_price, t.exit_date, t.exit_price, t.duration_days, t.return_pct, t.pnl].join(","));
                  const csv = [headers.join(","), ...rows].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Astra_trades_${result.run_id}.csv`; a.click();
                }}>↓ Export CSV</button>
                <button className="nb-btn nb-btn-lime text-xs" onClick={downloadPdf} disabled={isPdfGenerating}>
                  {isPdfGenerating ? "Generating PDF..." : "📄 Export Tearsheet PDF"}
                </button>
                <button className="nb-btn nb-btn-primary text-xs" onClick={() => { setResult(null); setError(""); setActiveAgentIdx(-1); }}>
                  ← New Backtest
                </button>
              </div>

              {/* Hidden Tearsheet Node */}
              <div style={{ position: "absolute", top: "-9999px", left: "-9999px" }}>
                <TearsheetPdf ref={pdfRef} result={result} />
              </div>
            </div>
          )}

          {/* ── Footer ───────────────────────────────────────── */}
          <div className="mt-16 pt-6" style={{ borderTop: "2px solid #1a1a1a" }}>
            <p className="mono text-[0.6rem] text-center" style={{ color: "var(--text-muted)" }}>
              Astra.AI — For educational & research purposes only. Not financial advice. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--bg-primary)", minHeight: "100vh" }} />}>
      <DashboardContent />
    </Suspense>
  );
}
