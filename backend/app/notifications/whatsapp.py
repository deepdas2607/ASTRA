"""Astra WhatsApp — Chart rendering, message formatting, and Twilio messaging."""
from __future__ import annotations
import io
import os
import tempfile
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from twilio.rest import Client
from app.core.config import settings


# ── Chart Rendering ─────────────────────────────────────────────

def render_charts(equity_curve: list[dict], drawdown_curve: list[dict]) -> bytes:
    """Render stacked equity + drawdown chart as PNG bytes in Astra dark theme."""

    # Astra color palette
    BG = "#0a0a0a"
    CARD_BG = "#1a1a1a"
    CYAN = "#00e5ff"
    RED = "#ff1744"
    GRID = "#252525"
    TEXT = "#a0a0a0"
    TEXT_BRIGHT = "#f5f5f5"

    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(10, 6), height_ratios=[2, 1],
        facecolor=BG, gridspec_kw={"hspace": 0.05},
    )

    # ── Equity Curve ────────────────────────────────────────
    dates_eq = [e.get("date", "")[:10] for e in equity_curve]
    equities = [e.get("equity", 0) for e in equity_curve]

    ax1.set_facecolor(CARD_BG)
    ax1.fill_between(range(len(equities)), equities, alpha=0.15, color=CYAN)
    ax1.plot(equities, color=CYAN, linewidth=1.5, label="Equity")
    ax1.set_title("EQUITY CURVE", fontsize=10, fontweight="bold",
                   color=TEXT_BRIGHT, loc="left", pad=10, fontfamily="monospace")
    ax1.set_ylabel("Equity ($)", fontsize=8, color=TEXT, fontfamily="monospace")
    ax1.tick_params(colors=TEXT, labelsize=7)
    ax1.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"${x:,.0f}"))
    ax1.grid(True, alpha=0.3, color=GRID, linewidth=0.5)
    ax1.set_xlim(0, len(equities) - 1)
    ax1.set_xticklabels([])
    for spine in ax1.spines.values():
        spine.set_color(GRID)

    # ── Drawdown Curve ──────────────────────────────────────
    drawdowns = [d.get("drawdown", 0) for d in drawdown_curve]

    ax2.set_facecolor(CARD_BG)
    ax2.fill_between(range(len(drawdowns)), drawdowns, alpha=0.25, color=RED)
    ax2.plot(drawdowns, color=RED, linewidth=1.2, label="Drawdown")
    ax2.set_title("DRAWDOWN", fontsize=10, fontweight="bold",
                   color=TEXT_BRIGHT, loc="left", pad=10, fontfamily="monospace")
    ax2.set_ylabel("Drawdown (%)", fontsize=8, color=TEXT, fontfamily="monospace")
    ax2.tick_params(colors=TEXT, labelsize=7)
    ax2.grid(True, alpha=0.3, color=GRID, linewidth=0.5)
    ax2.set_xlim(0, len(drawdowns) - 1)
    ax2.invert_yaxis()
    for spine in ax2.spines.values():
        spine.set_color(GRID)

    # X-axis labels (dates) on bottom chart only
    if dates_eq:
        n = len(dates_eq)
        step = max(1, n // 6)
        ticks = list(range(0, n, step))
        ax2.set_xticks(ticks)
        ax2.set_xticklabels([dates_eq[i] for i in ticks], fontsize=7, color=TEXT,
                             rotation=45, ha="right", fontfamily="monospace")

    # Branding
    fig.text(0.99, 0.01, "ASTRA.AI", fontsize=7, color="#333",
             ha="right", va="bottom", fontfamily="monospace", fontweight="bold")

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor=BG, edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ── Message Formatting ──────────────────────────────────────────

def format_backtest_message(result) -> str:
    """Format a BacktestResult into a WhatsApp-friendly text message."""
    m = result.metrics
    lines = [
        "🚀 *Astra Backtest Complete*",
        "",
        f"📊 *{result.strategy_name}*",
        f"Symbol: {result.symbol} | Lookback: {result.lookback}",
        "",
        "━━━ Performance ━━━",
        f"Total Return: {'+' if m.total_return >= 0 else ''}{m.total_return}%",
        f"Sharpe Ratio: {m.sharpe_ratio:.2f}",
        f"Max Drawdown: {m.max_drawdown}%",
        f"Win Rate: {m.win_rate}%",
        f"Alpha: {'+' if m.alpha >= 0 else ''}{m.alpha}%",
        f"Trades: {m.trade_count}",
        f"Profit Factor: {m.profit_factor:.2f}",
    ]

    # Strategy explanation
    if result.explanation:
        lines += ["", "━━━ Strategy ━━━", result.explanation[:300]]

    # Risk warnings
    if result.risk_warnings:
        lines += ["", "⚠️ *Warnings*"]
        for w in result.risk_warnings[:3]:
            lines.append(f"• {w.message}")

    # Insights
    if result.insights:
        lines += ["", "💡 *Insights*"]
        for ins in result.insights[:3]:
            lines.append(f"• {ins.message}")

    # Macro-Shield
    shield = result.macro_shield_report
    if shield and shield.get("total_events", 0) > 0:
        lines.append(f"\n🛡️ Macro-Shield: {shield.get('total_bars_gated', 0)} bars gated | {shield.get('shocks_detected', 0)} shocks")

    lines += ["", f"⏱️ Pipeline: {result.duration_ms:,}ms"]

    return "\n".join(lines)


def format_chat_message(response: str) -> str:
    """Format a chat response for WhatsApp."""
    return f"🧠 *Astra*\n\n{response}"


# ── Twilio Messaging ────────────────────────────────────────────

def _get_twilio_client() -> Client:
    """Get configured Twilio client."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        raise RuntimeError("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env")
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def send_whatsapp_text(to: str, body: str) -> str:
    """Send a text-only WhatsApp message. Returns message SID."""
    client = _get_twilio_client()
    # Ensure whatsapp: prefix
    if not to.startswith("whatsapp:"):
        to = f"whatsapp:{to}"

    msg = client.messages.create(
        from_=settings.TWILIO_WHATSAPP_FROM,
        to=to,
        body=body,
    )
    return msg.sid


def send_whatsapp_image(to: str, image_bytes: bytes, caption: str = "") -> str:
    """Send an image via WhatsApp. Saves to temp file and uses Twilio media URL."""
    client = _get_twilio_client()
    if not to.startswith("whatsapp:"):
        to = f"whatsapp:{to}"

    # Save image to temp file for Twilio to access
    # Note: For production, upload to cloud storage (S3, GCS) and use the URL
    # For Twilio sandbox, we'll use a publicly accessible URL or base64
    # Twilio requires a public URL for media, so we save locally and serve via FastAPI
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir="/tmp")
    tmp.write(image_bytes)
    tmp.close()

    # Store path for serving via our API
    return tmp.name


def send_whatsapp_report(to: str, result, base_url: str = "") -> dict:
    """Send full backtest report: text message + chart image."""
    # Send text summary
    text = format_backtest_message(result)
    text_sid = send_whatsapp_text(to, text)

    # Render and send chart
    chart_bytes = render_charts(result.equity_curve, result.drawdown_curve)

    chart_sid = ""
    if base_url and chart_bytes:
        # Save chart and send with media URL
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir="/tmp")
        tmp.write(chart_bytes)
        tmp.close()
        chart_filename = os.path.basename(tmp.name)
        media_url = f"{base_url}/api/whatsapp/media/{chart_filename}"

        client = _get_twilio_client()
        if not to.startswith("whatsapp:"):
            to = f"whatsapp:{to}"

        msg = client.messages.create(
            from_=settings.TWILIO_WHATSAPP_FROM,
            to=to,
            body="📈 Equity Curve & Drawdown",
            media_url=[media_url],
        )
        chart_sid = msg.sid

    return {
        "text_sid": text_sid,
        "chart_sid": chart_sid,
        "status": "sent",
    }
