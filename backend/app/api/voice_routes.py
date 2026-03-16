"""Voice API routes — audio upload, transcription, LLM chat, and conversation history."""
from __future__ import annotations
import json
import traceback
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from app.voice.conversation import transcribe_audio, chat_with_astra
from app.core.auth import get_current_user, require_user
from app.core.database import execute_one, execute_query

voice_router = APIRouter()


# ── Voice chat (with optional persistence) ───────────────────────

@voice_router.post("/api/voice/chat")
async def voice_chat(
    audio: UploadFile = File(...),
    history: str = Form(default="[]"),
    conversation_id: str = Form(default=""),
    user=Depends(get_current_user),
):
    """Accept audio + conversation history, return transcription + LLM response.
    If user is authenticated, persist messages to DB."""
    try:
        # Read audio bytes
        audio_bytes = await audio.read()
        filename = audio.filename or "audio.webm"
        print(f"[Voice] Received audio: {filename}, size={len(audio_bytes)} bytes")

        # Parse conversation history
        try:
            chat_history = json.loads(history)
        except (json.JSONDecodeError, TypeError):
            chat_history = []

        # Step 1: Transcribe
        print("[Voice] Transcribing audio...")
        transcript = transcribe_audio(audio_bytes, filename)
        print(f"[Voice] Transcript: {transcript[:100] if transcript else '(empty)'}")

        if not transcript.strip():
            return {
                "transcript": "",
                "response": "I didn't catch that. Could you try speaking again?",
                "intent": "chat",
                "conversation_id": conversation_id or None,
            }

        # Step 2: Chat with Astra
        print("[Voice] Generating response...")
        result = chat_with_astra(transcript, chat_history)
        print(f"[Voice] Response generated: {result['response'][:100]}")

        # Step 3: Persist to DB if user is authenticated
        conv_id = conversation_id or None
        if user:
            conv_id = _persist_voice_exchange(
                user_id=user["user_id"],
                conversation_id=conv_id,
                transcript=transcript,
                response=result["response"],
            )

        result["conversation_id"] = conv_id
        return result

    except Exception as e:
        print(f"[Voice] ERROR: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Voice processing error: {str(e)}"},
        )


def _persist_voice_exchange(
    user_id: str,
    conversation_id: str | None,
    transcript: str,
    response: str,
) -> str:
    """Save user+assistant messages to DB. Creates conversation if needed."""
    try:
        if not conversation_id:
            # Create new conversation with title from first message
            title = transcript[:60].strip()
            if len(transcript) > 60:
                title += "..."
            row = execute_one(
                """INSERT INTO voice_conversations (user_id, title)
                   VALUES (%s::uuid, %s) RETURNING id""",
                (user_id, title),
            )
            conversation_id = str(row["id"])
        else:
            # Update the timestamp on existing conversation
            execute_query(
                "UPDATE voice_conversations SET updated_at = NOW() WHERE id = %s::uuid",
                (conversation_id,),
                fetch=False,
            )

        # Insert user message
        execute_one(
            """INSERT INTO voice_messages (conversation_id, role, content)
               VALUES (%s::uuid, 'user', %s) RETURNING id""",
            (conversation_id, transcript),
        )

        # Insert assistant message
        execute_one(
            """INSERT INTO voice_messages (conversation_id, role, content)
               VALUES (%s::uuid, 'assistant', %s) RETURNING id""",
            (conversation_id, response),
        )

        return conversation_id

    except Exception as e:
        print(f"[Voice DB] Failed to persist: {e}")
        return conversation_id or ""


# ── List conversations ───────────────────────────────────────────

@voice_router.get("/api/voice/conversations")
async def list_voice_conversations(user=Depends(require_user)):
    """List all voice conversations for the authenticated user."""
    rows = execute_query(
        """SELECT vc.id, vc.title, vc.created_at, vc.updated_at,
                  COUNT(vm.id) as message_count
           FROM voice_conversations vc
           LEFT JOIN voice_messages vm ON vm.conversation_id = vc.id
           WHERE vc.user_id = %s::uuid
           GROUP BY vc.id
           ORDER BY vc.updated_at DESC
           LIMIT 50""",
        (user["user_id"],),
    )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "message_count": r["message_count"],
            "created_at": str(r["created_at"]),
            "updated_at": str(r["updated_at"]),
        }
        for r in rows
    ]


# ── Get conversation messages ────────────────────────────────────

@voice_router.get("/api/voice/conversations/{conversation_id}")
async def get_voice_conversation(conversation_id: str, user=Depends(require_user)):
    """Get all messages for a specific conversation."""
    # Verify ownership
    conv = execute_one(
        "SELECT id FROM voice_conversations WHERE id = %s::uuid AND user_id = %s::uuid",
        (conversation_id, user["user_id"]),
    )
    if not conv:
        return JSONResponse(status_code=404, content={"detail": "Conversation not found"})

    messages = execute_query(
        """SELECT role, content, created_at
           FROM voice_messages
           WHERE conversation_id = %s::uuid
           ORDER BY created_at ASC""",
        (conversation_id,),
    )
    return [
        {
            "role": r["role"],
            "content": r["content"],
            "timestamp": str(r["created_at"]),
        }
        for r in messages
    ]


# ── Delete conversation ──────────────────────────────────────────

@voice_router.delete("/api/voice/conversations/{conversation_id}")
async def delete_voice_conversation(conversation_id: str, user=Depends(require_user)):
    """Delete a voice conversation and all its messages."""
    conv = execute_one(
        "SELECT id FROM voice_conversations WHERE id = %s::uuid AND user_id = %s::uuid",
        (conversation_id, user["user_id"]),
    )
    if not conv:
        return JSONResponse(status_code=404, content={"detail": "Conversation not found"})

    execute_query(
        "DELETE FROM voice_conversations WHERE id = %s::uuid",
        (conversation_id,),
        fetch=False,
    )
    return {"status": "deleted"}
