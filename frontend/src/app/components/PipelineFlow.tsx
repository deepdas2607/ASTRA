"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ────────────────────────────────────────────────────────

interface AgentLog {
  agent_name: string;
  status: string;
  duration_ms: number;
  summary: string;
}

interface PipelineFlowProps {
  strategyText: string;
  symbol: string;
  lookback: string;
  explanation?: string;
  strategyType?: string;
  confidence?: number;
  ambiguities?: string[];
  metrics?: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    trade_count: number;
    profit_factor: number;
  };
  agentLogs?: AgentLog[];
  signalCount?: { buy: number; sell: number };
  riskWarnings?: { code: string; message: string }[];
  insights?: { message: string }[];
  durationMs?: number;
  status?: string;
}

// ── Custom Node Component ────────────────────────────────────────

function AgentNode({ data }: { data: any }) {
  return (
    <div
      style={{
        background: data.bgColor || "#1a1a1a",
        border: `3px ${data.borderStyle || "solid"} ${data.borderColor || "#333"}`,
        borderRadius: "0px",
        padding: "16px 20px",
        minWidth: data.width || 220,
        maxWidth: data.maxWidth || 280,
        position: "relative",
        boxShadow: data.glow
          ? `0 0 20px ${data.borderColor}22, 6px 6px 0px #000`
          : "6px 6px 0px #000",
      }}
    >
      {/* Top accent line */}
      {data.accentColor && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: data.accentColor,
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        {data.icon && <span style={{ fontSize: "16px" }}>{data.icon}</span>}
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "13px",
            color: data.titleColor || "#f5f5f5",
          }}
        >
          {data.title}
        </span>
        {data.status === "complete" && (
          <span
            style={{
              marginLeft: "auto",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: data.accentColor || "#00e676",
              color: "#000",
              fontSize: "11px",
              fontWeight: 800,
              border: "2px solid #000",
            }}
          >
            ✓
          </span>
        )}
        {data.status === "warning" && (
          <span
            style={{
              marginLeft: "auto",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#ff9100",
              color: "#000",
              fontSize: "11px",
              fontWeight: 800,
              border: "2px solid #000",
            }}
          >
            !
          </span>
        )}
      </div>

      {/* Duration tag */}
      {data.duration && (
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            color: data.accentColor || "#666",
            marginBottom: "8px",
          }}
        >
          {data.duration}ms
        </div>
      )}

      {/* Description */}
      {data.description && (
        <div
          style={{
            fontSize: "11px",
            color: "#a0a0a0",
            lineHeight: "1.5",
            marginBottom: data.details?.length ? "8px" : "0",
          }}
        >
          {data.description}
        </div>
      )}

      {/* Detail items */}
      {data.details?.map((detail: string, i: number) => (
        <div
          key={i}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            color: detail.startsWith("⚠") ? "#ff9100" : detail.startsWith("✓") ? "#00e676" : "#888",
            padding: "2px 0",
            lineHeight: "1.4",
          }}
        >
          {detail}
        </div>
      ))}

      {/* Handles */}
      {data.hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: data.accentColor || "#333", width: 8, height: 8, border: "2px solid #000" }}
        />
      )}
      {data.hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: data.accentColor || "#333", width: 8, height: 8, border: "2px solid #000" }}
        />
      )}
      {data.hasTopInput && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: data.accentColor || "#333", width: 8, height: 8, border: "2px solid #000" }}
        />
      )}
      {data.hasBottomOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: data.accentColor || "#333", width: 8, height: 8, border: "2px solid #000" }}
        />
      )}
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

// ── Main Component ───────────────────────────────────────────────

export default function PipelineFlow(props: PipelineFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const getLog = (name: string) => props.agentLogs?.find((l) => l.agent_name.toLowerCase().includes(name.toLowerCase()));

    const parserLog = getLog("parser") || getLog("Parser");
    const reasoningLog = getLog("reason") || getLog("Reason");
    const dataLog = getLog("data") || getLog("Data");
    const compilerLog = getLog("compiler") || getLog("Compiler");
    const macroShieldLog = getLog("macro-shield") || getLog("Macro-Shield") || getLog("shield");
    const executionLog = getLog("execution") || getLog("Execution");
    const analyticsLog = getLog("analytics") || getLog("Analytics");

    const STEP_X = 350;
    const ROW_MAIN = 0;
    const ROW_SUB = 350;

    const nodes: Node[] = [
      // ── Row 1: Input ──────────────────────────
      {
        id: "input",
        type: "agentNode",
        position: { x: 0, y: ROW_MAIN },
        data: {
          icon: "📝",
          title: "Strategy Input",
          accentColor: "#00e5ff",
          borderColor: "#00e5ff",
          status: "complete",
          description: props.strategyText.length > 90
            ? props.strategyText.slice(0, 90) + "…"
            : props.strategyText,
          details: [`Symbol: ${props.symbol}`, `Lookback: ${props.lookback}`],
          hasOutput: true,
          width: 260,
        },
      },
      {
        id: "config",
        type: "agentNode",
        position: { x: 0, y: ROW_SUB },
        data: {
          icon: "⚙️",
          title: "Configuration",
          borderColor: "#444",
          borderStyle: "dashed",
          status: "complete",
          details: [
            `Ticker: ${props.symbol}`,
            `Timeframe: 1d`,
            `Period: ${props.lookback}`,
            `Commission: auto`,
            `Slippage: auto`,
          ],
          hasOutput: true,
          width: 200,
        },
      },

      // ── Row 2: Parser + Data ──────────────────
      {
        id: "parser",
        type: "agentNode",
        position: { x: STEP_X * 1, y: ROW_MAIN },
        data: {
          icon: "🧠",
          title: "LLM Parser Agent",
          accentColor: "#00e5ff",
          borderColor: "#00e5ff",
          glow: true,
          status: "complete",
          duration: parserLog?.duration_ms,
          description: "Translates natural language to structured rules via Groq LLM",
          details: [
            props.strategyType ? `✓ Type: ${props.strategyType}` : null,
            props.confidence ? `✓ Confidence: ${(props.confidence * 100).toFixed(0)}%` : null,
            ...(props.ambiguities?.map((a) => `⚠ ${a}`) || []),
          ].filter(Boolean) as string[],
          hasInput: true,
          hasOutput: true,
          width: 260,
        },
      },
      {
        id: "data",
        type: "agentNode",
        position: { x: STEP_X * 1, y: ROW_SUB },
        data: {
          icon: "📊",
          title: "Market Data Fetch",
          accentColor: "#ffd600",
          borderColor: "#ffd600",
          borderStyle: "dashed",
          status: "complete",
          duration: dataLog?.duration_ms,
          description: "Fetches OHLCV data via Yahoo Finance API with fallback",
          details: [
            `✓ Symbol: ${props.symbol}`,
            `✓ Period: ${props.lookback}`,
            `✓ Interval: 1d`,
          ],
          hasInput: true,
          hasOutput: true,
          width: 220,
        },
      },

      // ── Row 3: Reasoning ──────────────────────
      {
        id: "reasoning",
        type: "agentNode",
        position: { x: STEP_X * 2, y: ROW_MAIN },
        data: {
          icon: "🔍",
          title: "Reasoning Agent",
          accentColor: "#c6ff00",
          borderColor: "#c6ff00",
          status: "complete",
          duration: reasoningLog?.duration_ms,
          description: "Validates feasibility, detects contradictions, estimates risk",
          details: [
            props.explanation
              ? `✓ ${props.explanation.length > 80 ? props.explanation.slice(0, 80) + "…" : props.explanation}`
              : "✓ Strategy validated",
            ...(props.ambiguities?.length ? [`⚠ ${props.ambiguities.length} ambiguity note(s)`] : []),
          ],
          hasInput: true,
          hasOutput: true,
          width: 280,
        },
      },

      // ── Row 4: Compiler ───────────────────────
      {
        id: "compiler",
        type: "agentNode",
        position: { x: STEP_X * 3, y: ROW_MAIN },
        data: {
          icon: "⚙️",
          title: "Strategy Compiler",
          accentColor: "#ff9100",
          borderColor: "#ff9100",
          status: "complete",
          duration: compilerLog?.duration_ms,
          description: "Converts rules into boolean signal vectors with indicator warmup",
          details: [
            props.signalCount
              ? `✓ Generated ${props.signalCount.buy} buy signals`
              : "✓ Signal vectors computed",
            props.signalCount
              ? `✓ Generated ${props.signalCount.sell} sell signals`
              : null,
            "✓ Warmup period applied",
          ].filter(Boolean) as string[],
          hasInput: true,
          hasOutput: true,
          hasTopInput: true,
          width: 260,
        },
      },

      // ── Row 4.5: Macro-Shield ──────────────────
      {
        id: "macroshield",
        type: "agentNode",
        position: { x: STEP_X * 4, y: ROW_MAIN },
        data: {
          icon: "🛡️",
          title: "Macro-Shield",
          accentColor: "#ff1744",
          borderColor: "#ff1744",
          glow: true,
          status: "complete",
          duration: macroShieldLog?.duration_ms,
          description: "Event safety gating: cool-off, shock detection, ATR volatility",
          details: macroShieldLog?.summary
            ? macroShieldLog.summary.split(". ").filter(Boolean).map((s: string) => `✓ ${s}`)
            : ["✓ Shield active"],
          hasInput: true,
          hasOutput: true,
          width: 260,
        },
      },

      // ── Row 5: Execution ──────────────────────
      {
        id: "execution",
        type: "agentNode",
        position: { x: STEP_X * 5, y: ROW_MAIN },
        data: {
          icon: "▶️",
          title: "Backtest Execution",
          accentColor: "#00e676",
          borderColor: "#00e676",
          glow: true,
          status: "complete",
          duration: executionLog?.duration_ms,
          description: "Simulates trades with realistic friction modeling",
          details: [
            props.metrics ? `✓ ${props.metrics.trade_count} trades executed` : null,
            "✓ Lookahead bias protection",
            "✓ Commission & slippage applied",
            "✓ Next-bar execution enforced",
          ].filter(Boolean) as string[],
          hasInput: true,
          hasOutput: true,
          hasBottomOutput: true,
          width: 260,
        },
      },

      // ── Row 6: Analytics ──────────────────────
      {
        id: "analytics",
        type: "agentNode",
        position: { x: STEP_X * 6, y: ROW_MAIN },
        data: {
          icon: "📈",
          title: "Analytics Agent",
          accentColor: "#b388ff",
          borderColor: "#b388ff",
          glow: true,
          status: "complete",
          duration: analyticsLog?.duration_ms,
          description: "Computes performance metrics, risk warnings, and insights",
          details: props.metrics
            ? [
                `✓ Return: ${props.metrics.total_return}%`,
                `✓ Sharpe: ${props.metrics.sharpe_ratio.toFixed(2)}`,
                `✓ Drawdown: ${props.metrics.max_drawdown}%`,
                `✓ Win Rate: ${props.metrics.win_rate}%`,
              ]
            : ["✓ Metrics computed"],
          hasInput: true,
          hasOutput: true,
          hasBottomOutput: true,
          width: 260,
        },
      },

      // ── Side cards ────────────────────────────
      {
        id: "risk",
        type: "agentNode",
        position: { x: STEP_X * 5, y: ROW_SUB },
        data: {
          icon: "⚠️",
          title: "Risk Warnings",
          borderColor: "#ff9100",
          borderStyle: "dashed",
          status: props.riskWarnings?.length ? "warning" : "complete",
          description: props.riskWarnings?.length
            ? `${props.riskWarnings.length} warning(s) detected`
            : "No warnings",
          details: props.riskWarnings
            ?.slice(0, 3)
            .map((w) => `⚠ ${w.message.length > 55 ? w.message.slice(0, 55) + "…" : w.message}`) || [],
          hasTopInput: true,
          width: 260,
          maxWidth: 300,
        },
      },
      {
        id: "insightsNode",
        type: "agentNode",
        position: { x: STEP_X * 6, y: ROW_SUB },
        data: {
          icon: "✦",
          title: "Insights",
          borderColor: "#00e5ff",
          borderStyle: "dashed",
          status: "complete",
          description: props.insights?.length
            ? `${props.insights.length} insight(s) generated`
            : "Analysis complete",
          details: props.insights
            ?.slice(0, 3)
            .map((ins) => `✓ ${ins.message.length > 55 ? ins.message.slice(0, 55) + "…" : ins.message}`) || [],
          hasTopInput: true,
          width: 260,
          maxWidth: 300,
        },
      },

      // ── Final Result ──────────────────────────
      {
        id: "result",
        type: "agentNode",
        position: { x: STEP_X * 7, y: ROW_MAIN },
        data: {
          icon: "🏁",
          title: "Final Tearsheet",
          accentColor:
            props.metrics && props.metrics.total_return >= 0 ? "#00e676" : "#ff1744",
          borderColor:
            props.metrics && props.metrics.total_return >= 0 ? "#00e676" : "#ff1744",
          bgColor: "#111",
          glow: true,
          status: "complete",
          duration: props.durationMs,
          description: "Complete performance tearsheet generated",
          details: props.metrics
            ? [
                `✓ Total Return: ${props.metrics.total_return}%`,
                `✓ Sharpe Ratio: ${props.metrics.sharpe_ratio.toFixed(2)}`,
                `✓ Profit Factor: ${props.metrics.profit_factor.toFixed(2)}`,
                `✓ Equity curve, drawdown, price charts`,
                `✓ Trade replay table (${props.metrics.trade_count} trades)`,
              ]
            : ["✓ Tearsheet ready"],
          hasInput: true,
          width: 280,
        },
      },
    ];

    const edgeStyle = {
      stroke: "#333",
      strokeWidth: 2,
    };

    const animatedEdge = {
      stroke: "#00e5ff44",
      strokeWidth: 2,
    };

    const edges: Edge[] = [
      { id: "e-input-parser", source: "input", target: "parser", style: { ...animatedEdge, stroke: "#00e5ff55" }, animated: true },
      { id: "e-config-data", source: "config", target: "data", style: { ...edgeStyle, stroke: "#ffd60044", strokeDasharray: "6 4" } },
      { id: "e-parser-reasoning", source: "parser", target: "reasoning", style: { ...animatedEdge, stroke: "#c6ff0055" }, animated: true },
      { id: "e-reasoning-compiler", source: "reasoning", target: "compiler", style: { ...animatedEdge, stroke: "#ff910055" }, animated: true },
      { id: "e-data-compiler", source: "data", target: "compiler", targetHandle: "top", style: { ...edgeStyle, stroke: "#ffd60044", strokeDasharray: "6 4" } },
      { id: "e-compiler-shield", source: "compiler", target: "macroshield", style: { ...animatedEdge, stroke: "#ff174455" }, animated: true },
      { id: "e-shield-exec", source: "macroshield", target: "execution", style: { ...animatedEdge, stroke: "#00e67655" }, animated: true },
      { id: "e-exec-analytics", source: "execution", target: "analytics", style: { ...animatedEdge, stroke: "#b388ff55" }, animated: true },
      { id: "e-exec-risk", source: "execution", target: "risk", targetHandle: "top", style: { ...edgeStyle, stroke: "#ff910033", strokeDasharray: "6 4" } },
      { id: "e-analytics-insights", source: "analytics", target: "insightsNode", targetHandle: "top", style: { ...edgeStyle, stroke: "#00e5ff33", strokeDasharray: "6 4" } },
      { id: "e-analytics-result", source: "analytics", target: "result", style: { ...animatedEdge, stroke: "#00e67655" }, animated: true },
    ];

    return { nodes, edges };
  }, [props]);

  return (
    <div
      style={{
        width: "100%",
        height: 600,
        background: "#0d0d0d",
        border: "3px solid #222",
        boxShadow: "8px 8px 0px #000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          background: "rgba(13,13,13,0.95)",
          borderBottom: "2px solid #222",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#00e5ff",
          }}
        >
          ◆ Agent Pipeline Flow
        </span>
        {props.durationMs && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "10px",
              color: "#666",
              marginLeft: "auto",
            }}
          >
            Total: {props.durationMs}ms
          </span>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        style={{ background: "transparent" }}
      >
        <Background color="#ffffff06" gap={20} size={1} />
        <Controls
          position="bottom-left"
          style={{
            border: "2px solid #333",
            background: "#1a1a1a",
            boxShadow: "4px 4px 0px #000",
          }}
        />
      </ReactFlow>
    </div>
  );
}
