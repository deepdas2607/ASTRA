"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { authFetch, API_URL, isAuthenticated } from "@/lib/auth";

const AstraVoiceOrb = dynamic(() => import("./AstraVoiceOrb"), { ssr: false });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

type VoiceState = "idle" | "listening" | "processing" | "speaking";

export default function VoicePanel() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState("");

  // Conversation history state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch conversation list on mount
  useEffect(() => {
    if (isAuthenticated()) {
      fetchConversations();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Conversation history API ──────────────────────────────────

  const fetchConversations = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/voice/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  };

  const loadConversation = async (convId: string) => {
    setLoadingHistory(true);
    setError("");
    try {
      const res = await authFetch(`${API_URL}/api/voice/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = data.map((m: any, i: number) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).getTime() || Date.now() + i,
        }));
        setMessages(msgs);
        setActiveConversationId(convId);
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (convId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/voice/conversations/${convId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setError("");
    setLiveTranscript("");
  };

  // ── Audio ─────────────────────────────────────────────────────

  const startAudioMonitor = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
      setAudioLevel(avg / 255);
      animFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);
        handleAudioSubmit(audioBlob, mimeType);
      };

      recorder.start();
      startAudioMonitor(stream);
      setVoiceState("listening");
      setLiveTranscript("Listening...");
    } catch (err: any) {
      setError("Microphone access denied. Please allow microphone permissions.");
      console.error("Mic error:", err);
    }
  }, [startAudioMonitor]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleAudioSubmit = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      setVoiceState("processing");
      setLiveTranscript("Processing your voice...");

      const ext = mimeType.includes("webm") ? "webm" : "mp4";
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${ext}`);
      formData.append("history", JSON.stringify(messages.slice(-10)));
      if (activeConversationId) {
        formData.append("conversation_id", activeConversationId);
      }

      try {
        const res = await authFetch(`${API_URL}/api/voice/chat`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();

        // Add user message
        const userMsg: ChatMessage = {
          role: "user",
          content: data.transcript || "...",
          timestamp: Date.now(),
        };

        // Add assistant message
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.response,
          timestamp: Date.now() + 1,
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setLiveTranscript("");

        // Track conversation ID
        if (data.conversation_id) {
          setActiveConversationId(data.conversation_id);
          // Refresh conversation list
          fetchConversations();
        }

        // Speak the response
        speakResponse(data.response);
      } catch (err: any) {
        setError(err.message || "Failed to process voice");
        setVoiceState("idle");
        setLiveTranscript("");
      }
    },
    [messages, activeConversationId]
  );

  const speakResponse = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      setVoiceState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.name.includes("Samantha") ||
        v.name.includes("Google") ||
        v.name.includes("Daniel") ||
        v.lang.startsWith("en")
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    utterance.onerror = () => setVoiceState("idle");

    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleVoice = () => {
    if (voiceState === "listening") {
      stopRecording();
    } else if (voiceState === "idle") {
      startRecording();
    }
  };

  // ── Time formatting ───────────────────────────────────────────

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const STATUS_MAP: Record<VoiceState, { label: string; color: string }> = {
    idle: { label: "Ready — tap the mic to speak", color: "var(--text-muted)" },
    listening: { label: "Listening...", color: "#00e5ff" },
    processing: { label: "Astra is thinking...", color: "#b388ff" },
    speaking: { label: "Astra is speaking...", color: "#c6ff00" },
  };

  return (
    <div className="voice-panel">

      {/* ── Conversation History ─────────────────────────────── */}
      {isAuthenticated() && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs uppercase tracking-wider font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              Conversation History
            </span>
            <div style={{ flex: 1, height: "1px", background: "#222" }} />
            <button
              className="mono text-[0.6rem] px-3 py-1 cursor-pointer"
              style={{
                color: !activeConversationId ? "var(--accent-purple)" : "var(--text-muted)",
                border: `1px solid ${!activeConversationId ? "var(--accent-purple)" : "#333"}`,
                background: !activeConversationId ? "#b388ff0a" : "var(--bg-card)",
                fontWeight: 700,
              }}
              onClick={startNewConversation}
            >
              + New Chat
            </button>
          </div>

          {conversations.length === 0 ? (
            <div
              className="text-center py-4"
              style={{
                background: "var(--bg-card)",
                border: "2px dashed #252525",
                color: "var(--text-muted)",
              }}
            >
              <span className="text-xs">No conversations yet. Start speaking to create one!</span>
            </div>
          ) : (
            <div
              className="flex gap-2 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
            >
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex-shrink-0 cursor-pointer group relative"
                  style={{
                    width: "200px",
                    padding: "10px 12px",
                    background: activeConversationId === conv.id ? "#b388ff0a" : "var(--bg-card)",
                    border: `2px solid ${activeConversationId === conv.id ? "var(--accent-purple)" : "#252525"}`,
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => loadConversation(conv.id)}
                  onMouseEnter={(e) => {
                    if (activeConversationId !== conv.id)
                      (e.currentTarget as HTMLElement).style.borderColor = "#444";
                  }}
                  onMouseLeave={(e) => {
                    if (activeConversationId !== conv.id)
                      (e.currentTarget as HTMLElement).style.borderColor = "#252525";
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className="text-xs font-bold leading-tight"
                      style={{
                        color: activeConversationId === conv.id ? "var(--accent-purple)" : "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {conv.title}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[0.6rem] px-1 py-0.5 flex-shrink-0 cursor-pointer"
                      style={{
                        color: "#ff1744",
                        border: "1px solid #ff174433",
                        background: "#ff17440a",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="mono text-[0.55rem]" style={{ color: "var(--text-muted)" }}>
                      {conv.message_count} msgs
                    </span>
                    <span className="mono text-[0.55rem]" style={{ color: "var(--text-muted)" }}>
                      {timeAgo(conv.updated_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading overlay for conversation load */}
      {loadingHistory && (
        <div className="flex items-center justify-center py-4 mb-4">
          <div className="w-4 h-4 border-2 border-[var(--accent-purple)] border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-xs mono" style={{ color: "var(--accent-purple)" }}>
            Loading conversation...
          </span>
        </div>
      )}

      {/* Orb */}
      <div className="flex justify-center mb-6">
        <AstraVoiceOrb state={voiceState} audioLevel={audioLevel} size={260} />
      </div>

      {/* Status */}
      <div className="text-center mb-4">
        <span
          className="mono text-xs uppercase tracking-widest font-bold"
          style={{ color: STATUS_MAP[voiceState].color }}
        >
          {STATUS_MAP[voiceState].label}
        </span>
      </div>

      {/* Mic Button */}
      <div className="flex justify-center mb-6">
        <button
          className="voice-mic-btn"
          onClick={toggleVoice}
          disabled={voiceState === "processing" || voiceState === "speaking"}
          style={{
            background:
              voiceState === "listening"
                ? "#ff1744"
                : voiceState === "processing" || voiceState === "speaking"
                ? "#333"
                : "var(--accent-cyan)",
            borderColor:
              voiceState === "listening"
                ? "#ff1744"
                : voiceState === "processing" || voiceState === "speaking"
                ? "#444"
                : "#000",
            cursor:
              voiceState === "processing" || voiceState === "speaking"
                ? "not-allowed"
                : "pointer",
            animation: voiceState === "listening" ? "pulse 1.5s infinite" : "none",
          }}
        >
          {voiceState === "listening" ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={voiceState === "idle" ? "#000" : "#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      </div>

      {/* Live Transcript */}
      {liveTranscript && (
        <div className="voice-live-transcript">
          <span className="typing-cursor">{liveTranscript}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3" style={{ background: "#ff174411", border: "2px solid #ff1744" }}>
          <span className="text-xs" style={{ color: "#ff1744" }}>
            ✕ {error}
          </span>
        </div>
      )}

      {/* Chat History */}
      {messages.length > 0 && (
        <div className="voice-chat-history">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs uppercase tracking-wider font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              Conversation
            </span>
            <div style={{ flex: 1, height: "1px", background: "#222" }} />
            <button
              className="mono text-[0.6rem] px-2 py-0.5 cursor-pointer"
              style={{
                color: "var(--text-muted)",
                border: "1px solid #333",
                background: "var(--bg-card)",
              }}
              onClick={startNewConversation}
            >
              Clear
            </button>
          </div>

          <div
            className="voice-messages-scroll"
            style={{ maxHeight: "300px", overflowY: "auto" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`voice-message ${msg.role === "user" ? "voice-message-user" : "voice-message-assistant"}`}
              >
                <div className="voice-message-role">
                  {msg.role === "user" ? "You" : "Astra"}
                </div>
                <div className="voice-message-content">{msg.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-center mt-6">
        <span className="text-[0.6rem]" style={{ color: "var(--text-muted)" }}>
          Astra Voice uses Groq Whisper for transcription · Browser TTS for speech · Not financial advice
        </span>
      </div>
    </div>
  );
}
