"use client";

import { useState } from "react";
import { Copy, ExternalLink, Code2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { authFetch, API_URL } from "@/lib/auth";

interface DeploymentCardProps {
  strategyRules: any;
  symbol: string;
}

export default function DeploymentCard({ strategyRules, symbol }: DeploymentCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsOpen(true);
    if (code) return; // Already generated

    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${API_URL}/api/generate-production-code`, {
        method: "POST",
        body: JSON.stringify({ strategy_rules: strategyRules, symbol }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || "Failed to generate PineScript");
      }

      const data = await res.json();
      setCode(data.code);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 border-t-2 border-[#333] pt-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            🚀 Go Live on TradingView
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Automatically translate your strategy into a production-ready TradingView PineScript v5 file.
          </p>
        </div>
        {!isOpen && (
          <button
            onClick={handleGenerate}
            className="nb-btn py-2 text-sm flex items-center gap-2"
            style={{
              background: "var(--accent-cyan)",
              color: "#000",
              border: "2px solid #000",
              boxShadow: "3px 3px 0px #000",
              fontWeight: 700,
            }}
          >
            <Code2 size={16} />
            Generate TradingView Bridge
          </button>
        )}
      </div>

      {isOpen && (
        <div className="mt-6 animation-fade-in flex flex-col gap-6">
          {/* Step 1: Code Block */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Step 1: Copy the Strategy Code</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1 mono">
                  {symbol}_STRATEGY.PINE
                </p>
              </div>
              <button
                onClick={copyToClipboard}
                disabled={!code || loading}
                className="nb-btn py-1.5 px-3 text-xs flex items-center gap-2 transition-colors"
                style={{
                  background: copied ? "var(--accent-lime)" : "transparent",
                  color: copied ? "#000" : "var(--accent-cyan)",
                  border: `1px solid ${copied ? "#000" : "#333"}`,
                  opacity: (!code || loading) ? 0.5 : 1,
                  boxShadow: copied ? "2px 2px 0px #000" : "none",
                }}
              >
                <Copy size={14} />
                {copied ? "COPIED!" : "COPY CODE"}
              </button>
            </div>

            <div
              className="relative rounded-md overflow-hidden"
              style={{ border: "1px solid #333", background: "#0d0d0d" }}
            >
              {loading ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3 text-[var(--accent-cyan)]">
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold tracking-wider uppercase">Translating to PineScript...</span>
                </div>
              ) : error ? (
                <div className="h-48 flex items-center justify-center text-[var(--accent-red)] text-sm font-bold">
                  {error}
                </div>
              ) : code ? (
                <SyntaxHighlighter
                  language="javascript" // Close enough for generic highlighting if pinescript isn't available
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: "1.5rem",
                    background: "transparent",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-mono)",
                  }}
                  showLineNumbers={true}
                  wrapLines={true}
                >
                  {code}
                </SyntaxHighlighter>
              ) : null}
            </div>
          </div>

          {/* Step 2: TradingView Chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Step 2: Paste into Pine Editor</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1 mono">
                  LIVE INTERACTIVE CHART ({symbol})
                </p>
              </div>
              <a
                href={`https://www.tradingview.com/chart/?symbol=${symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Open the <strong>Pine Editor</strong> tab below the chart
                <ExternalLink size={12} />
              </a>
            </div>

            <div
              className="w-full h-[500px] rounded-md overflow-hidden relative"
              style={{ border: "1px solid #333" }}
            >
              <iframe
                title="TradingView Advanced Chart Widget"
                src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${symbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en`}
                width="100%"
                height="100%"
                frameBorder="0"
                scrolling="no"
                allowFullScreen={true}
                style={{ position: "absolute", top: 0, left: 0 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
