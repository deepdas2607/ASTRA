"use client";

import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

// This component uses a fixed size container to perfectly match standard A4 proportions (approx 794x1123 at 96dpi).
// We'll render it to a fixed pixel size so html2canvas captures it nicely.

export const TearsheetPdf = React.forwardRef<HTMLDivElement, { result: any }>(({ result }, ref) => {
  if (!result) return null;

  // Build chart data
  const chartData = result.equity_curve.map((eq: number, idx: number) => ({
    time: idx,
    equity: eq,
    benchmark: result.benchmark_series[idx],
  }));

  const m = result.metrics;

  return (
    <div
      ref={ref}
      style={{
        width: "800px",
        height: "1131px", // roughly A4 proportion
        backgroundColor: "white",
        color: "black",
        padding: "40px 50px",
        fontFamily: "'Times New Roman', Times, serif", // Classic institutional look
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #4a86e8", paddingBottom: "15px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold", fontFamily: "Arial, sans-serif" }}>Astra Quantitative Capital</h1>
          <p style={{ margin: "5px 0 0 0", fontSize: "12px", fontFamily: "Arial, sans-serif", fontWeight: "bold" }}>Astra AI Agentic Engine</p>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", fontFamily: "Arial, sans-serif" }}>Systematic Strategy Generation</p>
        </div>
        <div style={{ textAlign: "right", fontFamily: "Arial, sans-serif" }}>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#4a86e8", letterSpacing: "2px" }}>ASTRA</div>
          <div style={{ fontSize: "10px", marginTop: "4px" }}>Automated Intelligence Series</div>
        </div>
      </div>

      {/* TITLE */}
      <h2 style={{ fontSize: "22px", margin: "0 0 15px 0" }}>{result.strategy_name}</h2>

      {/* INVESTMENT STRATEGY APPROACH */}
      <div style={{ backgroundColor: "#4a86e8", color: "white", padding: "4px 10px", fontWeight: "bold", fontSize: "14px" }}>
        Investment Strategy and Approach
      </div>
      <div style={{ border: "1px solid #4a86e8", borderTop: "none", padding: "10px", fontSize: "12px", textAlign: "justify", lineHeight: "1.4", marginBottom: "20px" }}>
        {result.explanation || "Systematically generated via Autonomous LLM interaction. Evaluates deterministic quant pipelines leveraging momentum, mean reversion, and volatility breakout indicators. Engineered to optimize risk-adjusted returns within defined execution friction constraints."}
      </div>

      {/* TRADING STRATEGY ABSTRACT TABLE */}
      <div style={{ backgroundColor: "#4a86e8", color: "white", padding: "4px 10px", fontWeight: "bold", fontSize: "14px", textAlign: "center" }}>
        Trading Strategy Abstract
      </div>
      <div style={{ display: "flex", border: "1px solid #4a86e8", borderTop: "none", fontSize: "12px", marginBottom: "20px" }}>
        <div style={{ flex: 1, padding: "10px", borderRight: "1px solid #c9d9f5" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "3px 0" }}><strong>Asset Traded:</strong></td><td style={{ textAlign: "right" }}>{result.symbol}</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Type:</strong></td><td style={{ textAlign: "right" }}>{result.strategy_type || "Systematic Multi-Factor"}</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Timeframe / Lookback:</strong></td><td style={{ textAlign: "right" }}>{result.lookback || "2y"}</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Data Source:</strong></td><td style={{ textAlign: "right" }}>Multi-Fallback API</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Initial Capital:</strong></td><td style={{ textAlign: "right" }}>$10,000</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ flex: 1, padding: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "3px 0" }}><strong>Total Trades:</strong></td><td style={{ textAlign: "right" }}>{m.trade_count}</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Avg Trade Duration:</strong></td><td style={{ textAlign: "right" }}>{m.avg_trade_duration} bars</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Win Rate:</strong></td><td style={{ textAlign: "right" }}>{m.win_rate}%</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>Profit Factor:</strong></td><td style={{ textAlign: "right" }}>{m.profit_factor.toFixed(2)}</td></tr>
              <tr><td style={{ padding: "3px 0" }}><strong>AI Confidence:</strong></td><td style={{ textAlign: "right" }}>{result.confidence > 0 ? (result.confidence * 100).toFixed(0) + "%" : "N/A"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* PERFORMANCE ANALYSIS */}
      <div style={{ display: "flex" }}>
        {/* Left Side: Stats Table */}
        <div style={{ flex: "0 0 35%", border: "1px solid #4a86e8", borderRight: "none" }}>
          <div style={{ backgroundColor: "#4a86e8", color: "white", padding: "4px 10px", fontWeight: "bold", fontSize: "14px", textAlign: "center" }}>
            Performance Analysis
          </div>
          <div style={{ padding: "10px", fontSize: "11px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Arial, sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ccc" }}>
                  <th style={{ textAlign: "left", paddingBottom: "4px" }}>Metric</th>
                  <th style={{ textAlign: "right", paddingBottom: "4px" }}>Strategy</th>
                  <th style={{ textAlign: "right", paddingBottom: "4px" }}>Bench</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ padding: "4px 0" }}>Total Return</td><td style={{ textAlign: "right", fontWeight: "bold" }}>{m.total_return}%</td><td style={{ textAlign: "right" }}>{m.benchmark_return}%</td></tr>
                <tr><td style={{ padding: "4px 0" }}>CAGR</td><td style={{ textAlign: "right", fontWeight: "bold" }}>{m.annualized_return}%</td><td style={{ textAlign: "right" }}>—</td></tr>
                <tr><td style={{ padding: "4px 0" }}>Sharpe Ratio</td><td style={{ textAlign: "right", fontWeight: "bold" }}>{m.sharpe_ratio.toFixed(2)}</td><td style={{ textAlign: "right" }}>—</td></tr>
                <tr><td style={{ padding: "4px 0" }}>Sortino Ratio</td><td style={{ textAlign: "right", fontWeight: "bold" }}>{m.sortino_ratio.toFixed(2)}</td><td style={{ textAlign: "right" }}>—</td></tr>
                <tr><td style={{ padding: "4px 0" }}>Max Drawdown</td><td style={{ textAlign: "right", fontWeight: "bold", color: "#cc0000" }}>{m.max_drawdown}%</td><td style={{ textAlign: "right" }}>—</td></tr>
                <tr><td style={{ padding: "4px 0", borderBottom: "1px solid #ccc" }}>Alpha</td><td style={{ textAlign: "right", fontWeight: "bold", borderBottom: "1px solid #ccc" }}>{m.alpha}%</td><td style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>—</td></tr>
              </tbody>
            </table>

            <div style={{ marginTop: "15px", fontWeight: "bold", textDecoration: "underline", marginBottom: "5px" }}>Risk & Insights</div>
            <ul style={{ paddingLeft: "15px", margin: 0, color: "#444" }}>
              {result.insights?.slice(0, 3).map((insight: any, i: number) => (
                <li key={i} style={{ marginBottom: "4px", lineHeight: "1.2" }}>{insight.message}</li>
              ))}
              {result.risk_warnings?.slice(0, 2).map((warn: any, i: number) => (
                <li key={i} style={{ marginBottom: "4px", lineHeight: "1.2", color: "#cc0000" }}>{warn.message}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Side: Chart */}
        <div style={{ flex: "0 0 65%", border: "1px solid #4a86e8" }}>
          <div style={{ backgroundColor: "#4a86e8", color: "white", padding: "4px 10px", fontWeight: "bold", fontSize: "14px", textAlign: "center" }}>
            Return on Initial Investment (Equity vs Benchmark)
          </div>
          <div style={{ padding: "10px", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                <XAxis dataKey="time" hide />
                <YAxis domain={["auto", "auto"]} orientation="left" tick={{ fontSize: 10, fontFamily: "Arial" }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val.toLocaleString()}`} />
                <Line type="monotone" dataKey="equity" stroke="#1f77b4" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#555" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: "center", fontSize: "10px", fontFamily: "Arial, sans-serif", paddingBottom: "10px", color: "#444" }}>
            <span style={{ display: "inline-block", width: "12px", height: "2px", background: "#1f77b4", verticalAlign: "middle", marginRight: "4px" }}></span> Strategy Equity
            <span style={{ display: "inline-block", width: "12px", height: "2px", borderTop: "2px dashed #555", verticalAlign: "middle", marginLeft: "15px", marginRight: "4px" }}></span> Benchmark (Raw S&P / Base)
          </div>
        </div>
      </div>

      {/* FOOTER DISCLAIMER */}
      <div style={{ position: "absolute", bottom: "40px", left: "50px", right: "50px", borderTop: "1px solid #ccc", paddingTop: "10px", fontSize: "8px", color: "#555", fontFamily: "Arial, sans-serif", lineHeight: "1.3", textAlign: "justify" }}>
        *This document is auto-generated by Astra AI and does not constitute an offer to sell or solicit any person to purchase securities. Any mention of strategies or assets named in this document is neither a recommendation nor a solicitation. No person should rely on any information in this document without consulting a registered financial advisor. Simulated performance results have certain inherent limitations. Unlike an actual performance record, simulated results do not represent actual trading and may not account for the impact that certain market factors, such as lack of liquidity, may have had on the decision-making process. Past performance is not indicative of future results.
      </div>

    </div>
  );
});

TearsheetPdf.displayName = "TearsheetPdf";
