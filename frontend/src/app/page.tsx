"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MinimalBackground from "@/components/MinimalBackground";
import Typewriter from "@/components/Typewriter";
import { getUser, isAuthenticated, logout } from "@/lib/auth";

const EXAMPLE_STRATEGIES = [
  "Buy when 50-day SMA crosses above 200-day SMA, sell when RSI exceeds 70",
  "Buy when RSI drops below 30, sell when RSI goes above 70",
  "Buy when MACD line crosses above signal line, sell when MACD crosses below",
  "Buy when price closes above upper Bollinger Band, sell when it drops below the middle band",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface LeaderboardEntry {
  rank: number | null;
  strategy_name: string | null;
  symbol: string;
  score: number;
  sharpe_ratio: number | null;
  total_return: number | null;
  user_name: string;
  created_at: string;
}

export default function Home() {
  const [hoveredExample, setHoveredExample] = useState<number | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; avatar_url?: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    fetch(`${API_URL}/api/leaderboard`)
      .then((r) => r.json())
      .then((data) => setLeaderboard(data))
      .catch(() => {})
      .finally(() => setLbLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav
        className="fixed top-0 w-full z-50 flex items-center justify-between px-6 py-4"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "3px solid #222",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 flex items-center justify-center font-bold text-sm"
            style={{
              background: "var(--accent-cyan)",
              color: "#000",
              border: "2px solid #000",
              boxShadow: "3px 3px 0px #000",
            }}
          >
            AS
          </div>
          <span className="font-bold text-lg tracking-tight">
            Astra<span style={{ color: "var(--accent-cyan)" }}>.AI</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
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
              <Link href="/dashboard">
                <button className="nb-btn nb-btn-primary">Dashboard →</button>
              </Link>
              <button
                onClick={logout}
                className="mono text-[0.65rem] px-2 py-1 cursor-pointer"
                style={{ color: "var(--text-muted)", border: "1px solid #333", background: "var(--bg-card)" }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login">
                <button className="nb-btn nb-btn-secondary">Login</button>
              </Link>
              <Link href="/dashboard">
                <button className="nb-btn nb-btn-primary">Launch App →</button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* React Bits Antigravity Background */}
        <div className="absolute inset-x-0 top-0 z-0 pointer-events-none" style={{ height: '500px' }}>
          <MinimalBackground />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              maskImage: "linear-gradient(to bottom, transparent 10%, #000 90%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 10%, #000 90%)",
            }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto">
          {/* Tag */}
          <div className="mb-6">
            <span className="nb-tag nb-tag-cyan">Agentic AI Engine</span>
          </div>

          {/* Headline */}
          <h1
            className="text-5xl md:text-7xl font-bold leading-[1.05] mb-6"
            style={{ maxWidth: "800px" }}
          >
            <Typewriter text="Backtest strategies" speed={70} loop={true} />
            <br />
            in{" "}
            <span
              style={{
                background: "var(--accent-cyan)",
                color: "#000",
                padding: "0 0.2em",
                display: "inline-block",
                boxShadow: "4px 4px 0px #000",
              }}
            >
              <Typewriter text="plain English" speed={70} delay={1500} loop={true} />
            </span>
          </h1>

          <p
            className="text-lg md:text-xl mb-10"
            style={{ color: "var(--text-secondary)", maxWidth: "600px" }}
          >
            Type your trading strategy. Our 6-agent AI pipeline parses, validates,
            compiles, simulates, and analyzes it — returning a full performance
            tearsheet in seconds.
          </p>

          <div className="flex gap-4 flex-wrap">
            <Link href="/dashboard">
              <button className="nb-btn nb-btn-lime text-base px-8 py-4">
                Start Backtesting →
              </button>
            </Link>
            <a href="#how-it-works">
              <button className="nb-btn nb-btn-secondary text-base px-8 py-4">
                How it works
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Pipeline visualization ──────────────────────────── */}
      <section id="how-it-works" className="py-20 px-6" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="mb-3">
            <span className="nb-tag nb-tag-lime">Architecture</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-12">
            6 Agents. One Pipeline. Zero Hallucinations.
          </h2>

          <div className="grid gap-4">
            {[
              {
                name: "Parser Agent",
                desc: "Converts natural language to structured rules via LLM",
                tag: "LLM-Powered",
                color: "var(--accent-cyan)",
              },
              {
                name: "Reasoning Agent",
                desc: "Validates feasibility, detects contradictions, generates risk notes",
                tag: "Deterministic",
                color: "var(--accent-lime)",
              },
              {
                name: "Strategy Compiler",
                desc: "Converts rules into executable signal vectors with warmup handling",
                tag: "Deterministic",
                color: "var(--accent-orange)",
              },
              {
                name: "Execution Agent",
                desc: "Runs simulation with commission, slippage, and lookahead protection",
                tag: "Deterministic",
                color: "var(--accent-green)",
              },
              {
                name: "Analytics Agent",
                desc: "Computes Sharpe, drawdown, win rate, insights, and risk warnings",
                tag: "Deterministic",
                color: "var(--accent-purple)",
              },
              {
                name: "Improvement Agent",
                desc: "Suggests strategy variants based on results (optional)",
                tag: "Optional",
                color: "var(--accent-pink)",
              },
            ].map((agent, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4"
                style={{
                  background: "var(--bg-card)",
                  border: `3px solid ${agent.color}33`,
                  borderLeft: `6px solid ${agent.color}`,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  className="mono text-xs font-bold w-7 h-7 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: agent.color,
                    color: "#000",
                    border: "2px solid #000",
                  }}
                >
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{agent.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {agent.desc}
                  </div>
                </div>
                <span
                  className="nb-tag text-[0.6rem]"
                  style={{ borderColor: agent.color, color: agent.color }}
                >
                  {agent.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Example strategies ──────────────────────────────── */}
      <section className="relative py-20 px-6 overflow-hidden">
        {/* Background Animation */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <MinimalBackground />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              maskImage: "linear-gradient(to bottom, transparent 10%, #000 90%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 10%, #000 90%)",
            }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="mb-3">
            <span className="nb-tag nb-tag-orange">Examples</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-12">
            Try these strategies
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {EXAMPLE_STRATEGIES.map((s, i) => (
              <Link href={`/dashboard?strategy=${encodeURIComponent(s)}`} key={i}>
                <div
                  className="nb-card cursor-pointer group"
                  onMouseEnter={() => setHoveredExample(i)}
                  onMouseLeave={() => setHoveredExample(null)}
                  style={{
                    borderColor: hoveredExample === i ? "var(--accent-cyan)" : "#333",
                  }}
                >
                  <div className="mono text-xs mb-2" style={{ color: "var(--accent-cyan)" }}>
                    Strategy #{i + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{s}</p>
                  <div
                    className="mt-3 text-xs font-bold uppercase tracking-wider"
                    style={{
                      color: hoveredExample === i ? "var(--accent-cyan)" : "var(--text-muted)",
                    }}
                  >
                    Click to test →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Leaderboard ─────────────────────────────────────── */}
      <section className="relative py-20 px-6" style={{ borderTop: "3px solid #222", background: "var(--bg-secondary)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="mb-3">
            <span className="nb-tag nb-tag-lime">Live</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            🏆 Strategy Leaderboard
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
            Top-performing strategies ranked by composite score. Updated dynamically.
          </p>

          {lbLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm" style={{ color: "var(--text-muted)" }}>Loading leaderboard...</span>
            </div>
          ) : leaderboard.length === 0 ? (
            <div
              className="nb-card text-center py-12"
              style={{ borderColor: "#333" }}
            >
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
                No strategies on the leaderboard yet.
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Run a backtest to be the first on the board!
              </p>
              <Link href="/dashboard">
                <button className="nb-btn nb-btn-primary text-xs mt-4">Launch Dashboard →</button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: "0 6px" }}>
                <thead>
                  <tr>
                    {["#", "Strategy", "Symbol", "Score", "Sharpe", "Return", "Trader"].map((h) => (
                      <th
                        key={h}
                        className="mono text-[0.6rem] uppercase tracking-wider py-2 px-3"
                        style={{ color: "var(--text-muted)", borderBottom: "1px solid #222" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => {
                    const rank = entry.rank ?? i + 1;
                    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
                    const isTop3 = rank <= 3;
                    return (
                      <tr
                        key={i}
                        style={{
                          background: isTop3 ? "rgba(0,229,255,0.04)" : "var(--bg-card)",
                          border: isTop3 ? "1px solid rgba(0,229,255,0.15)" : "1px solid #222",
                        }}
                      >
                        <td className="py-3 px-3 font-bold text-center" style={{ fontSize: isTop3 ? "1.1rem" : "0.85rem" }}>
                          {medal}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                            {entry.strategy_name || "Unnamed Strategy"}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className="nb-tag text-[0.6rem]"
                            style={{ borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}
                          >
                            {entry.symbol}
                          </span>
                        </td>
                        <td className="py-3 px-3 mono text-sm font-bold" style={{ color: "var(--accent-lime)" }}>
                          {entry.score.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 mono text-sm" style={{ color: "var(--text-secondary)" }}>
                          {entry.sharpe_ratio != null ? entry.sharpe_ratio.toFixed(2) : "—"}
                        </td>
                        <td className="py-3 px-3 mono text-sm font-bold" style={{ color: (entry.total_return ?? 0) >= 0 ? "var(--accent-lime)" : "var(--accent-red)" }}>
                          {entry.total_return != null ? `${entry.total_return >= 0 ? "+" : ""}${entry.total_return.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-3 px-3 text-xs" style={{ color: "var(--text-muted)" }}>
                          {entry.user_name || "Anonymous"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer
        className="py-8 px-6 text-center"
        style={{ borderTop: "3px solid #222" }}
      >
        <p className="mono text-xs" style={{ color: "var(--text-muted)" }}>
          Astra.AI — For educational & research purposes only. Not financial advice.
        </p>
      </footer>
    </div>
  );
}
