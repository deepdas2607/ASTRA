"""WhatsApp chatbot routes — Twilio webhook for incoming messages."""
from __future__ import annotations
import os
import threading
import traceback
from fastapi import APIRouter, Request, Form
from fastapi.responses import PlainTextResponse, FileResponse
from app.core.config import settings
from app.notifications.intent import classify_intent
from app.notifications.whatsapp import (
    send_whatsapp_text,
    send_whatsapp_report,
    format_chat_message,
)
from app.voice.conversation import chat_with_astra
from app.models.strategy import ParseRequest
from app.agents.supervisor import run_full_pipeline
from app.agents.generator import generate_and_backtest

whatsapp_router = APIRouter()

# In-memory store for per-user chat history (phone -> messages)
_chat_history: dict[str, list[dict]] = {}


def _process_message_async(from_number: str, body: str, base_url: str):
    """Process incoming WhatsApp message in background thread."""
    try:
        print(f"DEBUG: Processing message from {from_number}: {body}")
        
        # Classify intent
        classification = classify_intent(body)
        intent = classification["intent"]
        print(f"DEBUG: Classified intent as: {intent}")

        if intent == "backtest":
            print("DEBUG: Triggering backtest pipeline")
            send_whatsapp_text(from_number, "⚡ *Running backtest pipeline...*\nThis may take 10-30 seconds.")

            req = ParseRequest(
                strategy_text=classification["strategy_text"],
                symbol=classification["symbol"],
                timeframe="1d",
                lookback=classification["lookback"],
                macro_shield_enabled=True,
            )
            result = run_full_pipeline(req)
            print(f"DEBUG: Backtest status: {result.status}")

            if result.status == "failed":
                send_whatsapp_text(from_number, f"❌ *Backtest failed*\n\n{result.error}")
            else:
                send_whatsapp_report(from_number, result, base_url)

        elif intent == "generate":
            print("DEBUG: Triggering CrewAI generation")
            send_whatsapp_text(from_number, "🤖 *CrewAI agents are designing your strategy...*\nThis may take 30-60 seconds.")

            result = generate_and_backtest(
                goal=classification["goal"],
                symbol=classification["symbol"],
                lookback=classification["lookback"],
            )
            print(f"DEBUG: Generation status: {result.status}")

            if result.status == "failed":
                send_whatsapp_text(from_number, f"❌ *Generation failed*\n\n{result.error}")
            else:
                send_whatsapp_report(from_number, result, base_url)

        else:
            print("DEBUG: Handling general chat")
            history = _chat_history.get(from_number, [])
            chat_result = chat_with_astra(body, history)

            # Update history
            history.append({"role": "user", "content": body})
            history.append({"role": "assistant", "content": chat_result["response"]})
            _chat_history[from_number] = history[-20:]  # Keep last 20

            reply = format_chat_message(chat_result["response"])
            send_whatsapp_text(from_number, reply)
            print("DEBUG: Chat response sent")

    except Exception as e:
        print(f"DEBUG: Exception in _process_message_async: {e}")
        traceback.print_exc()
        try:
            send_whatsapp_text(from_number, f"⚠️ *Error*\n\n{str(e)[:200]}")
        except Exception:
            pass


@whatsapp_router.post("/api/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    """Twilio webhook — receives incoming WhatsApp messages."""
    form = await request.form()
    from_number = form.get("From", "")
    body = form.get("Body", "").strip()
    num_media = int(form.get("NumMedia", "0"))

    print(f"DEBUG: Webhook hit from {from_number} with body: {body}")

    if not body and num_media == 0:
        return PlainTextResponse("ok")

    if not body and num_media > 0:
        send_whatsapp_text(from_number, "🎵 Voice messages are coming soon! For now, please type your strategy or question.")
        return PlainTextResponse("ok")

    base_url = str(request.base_url).rstrip("/")
    print(f"DEBUG: Base URL for media: {base_url}")

    thread = threading.Thread(
        target=_process_message_async,
        args=(from_number, body, base_url),
        daemon=True,
    )
    thread.start()

    return PlainTextResponse("ok")


@whatsapp_router.get("/api/whatsapp/media/{filename}")
async def serve_media(filename: str):
    """Serve chart images for Twilio media URLs."""
    filepath = os.path.join("/tmp", filename)
    print(f"DEBUG: Serving media request for {filename}")
    if not os.path.exists(filepath):
        print(f"DEBUG: Media file not found: {filepath}")
        return PlainTextResponse("Not found", status_code=404)
    return FileResponse(filepath, media_type="image/png")


@whatsapp_router.get("/api/whatsapp/status")
async def whatsapp_status():
    """Check if WhatsApp integration is configured."""
    return {
        "configured": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
        "from_number": settings.TWILIO_WHATSAPP_FROM,
        "active_chats": len(_chat_history),
    }
