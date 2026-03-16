"""Astra Voice — Conversation engine using Groq Whisper + LLM."""
from __future__ import annotations
import io
from groq import Groq
from app.core.config import settings

ASTRA_SYSTEM_PROMPT = """\
You are **Astra**, a world-class quantitative trading advisor built into the Astra backtesting platform.

## Your Personality
- Speak like a sharp, confident hedge-fund strategist who genuinely cares about helping the user.
- Use concise, punchy sentences optimized for *spoken delivery* (your responses will be read aloud).
- Avoid bullet points and markdown in your responses — use natural conversational language.
- When referencing numbers, say them naturally (e.g., "about seventy percent" instead of "70%").

## Your Capabilities
- Help users design and refine trading strategies using supported indicators: SMA, EMA, RSI, MACD, Bollinger Bands, VWAP.
- Explain backtesting concepts: Sharpe ratio, Sortino ratio, max drawdown, alpha, win rate, profit factor.
- Suggest strategy improvements based on the user's goals (e.g., "maximize returns", "low drawdown", "momentum").
- Analyze and explain backtest results when the user shares them.

## Conversation Behavior
- Keep responses under 3-4 sentences for quick back-and-forth. Expand only if the user asks for detail.
- If the user describes a strategy clearly, classify your intent as "backtest" and confirm the parameters.
- If the user asks you to invent or generate a strategy, classify intent as "generate".
- For general questions or chat, classify intent as "chat".
- Always end your response with a clear next step or question to keep the conversation flowing.

## Constraints
- Only discuss trading, finance, and the Astra platform. Politely redirect off-topic questions.
- Never give financial advice or guarantees. Always frame suggestions as hypothetical backtesting scenarios.
"""


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio using Groq Whisper API.

    Args:
        audio_bytes: Raw audio file bytes (webm, mp3, wav, etc.)
        filename: Original filename with extension (used for format detection)

    Returns:
        Transcribed text string
    """
    client = Groq(api_key=settings.GROQ_API_KEY)

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    transcription = client.audio.transcriptions.create(
        file=(filename, audio_file),
        model=settings.GROQ_WHISPER_MODEL,
        response_format="text",
        language="en",
    )

    return transcription.strip() if isinstance(transcription, str) else str(transcription).strip()


def chat_with_astra(
    transcript: str,
    history: list[dict] | None = None,
) -> dict:
    """Send user transcript to Groq LLM with conversation history.

    Args:
        transcript: The user's transcribed speech
        history: List of prior messages [{"role": "user"/"assistant", "content": "..."}]

    Returns:
        Dict with keys: transcript, response, intent
    """
    client = Groq(api_key=settings.GROQ_API_KEY)

    messages = [{"role": "system", "content": ASTRA_SYSTEM_PROMPT}]

    # Add conversation history
    if history:
        for msg in history[-10:]:  # Keep last 10 messages for context
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            })

    messages.append({"role": "user", "content": transcript})

    # Add intent classification instruction
    intent_instruction = (
        "\n\n[INTERNAL — do not print this to the user] "
        "After your response, output a single line: INTENT: <chat|backtest|generate>"
    )
    messages[-1]["content"] += intent_instruction

    response = client.chat.completions.create(
        model=settings.VOICE_LLM_MODEL,
        messages=messages,
        temperature=settings.VOICE_TEMPERATURE,
        max_tokens=settings.VOICE_MAX_TOKENS,
    )

    raw_text = response.choices[0].message.content or ""

    # Parse intent from response
    intent = "chat"
    response_text = raw_text
    if "INTENT:" in raw_text:
        parts = raw_text.rsplit("INTENT:", 1)
        response_text = parts[0].strip()
        intent_str = parts[1].strip().lower()
        if intent_str in ("backtest", "generate", "chat"):
            intent = intent_str

    return {
        "transcript": transcript,
        "response": response_text,
        "intent": intent,
    }
