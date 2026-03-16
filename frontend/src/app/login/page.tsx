"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, signup, isAuthenticated } from "@/lib/auth";
import MinimalBackground from "@/components/MinimalBackground";

const GOOGLE_CLIENT_ID = "696335008268-hmn52sak278s58nvdje29gsfnc6v45aq.apps.googleusercontent.com";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router]);

  // Load Google Identity Services
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        window.google.accounts.id.renderButton(
          document.getElementById("google-btn-container"),
          {
            theme: "filled_black",
            size: "large",
            width: 360,
            shape: "rectangular",
            text: mode === "login" ? "signin_with" : "signup_with",
          }
        );
      }
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [mode]);

  const handleGoogleResponse = async (response: any) => {
    setLoading(true);
    setError("");
    try {
      const { googleLogin } = await import("@/lib/auth");
      await googleLogin(response.credential);
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Google login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        await signup(email, password, fullName);
      } else {
        await login(email, password);
      }
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <MinimalBackground />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            background: "radial-gradient(circle at 50% 50%, transparent 0%, var(--bg-primary) 100%)",
            opacity: 0.85,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 flex items-center justify-center font-bold text-sm"
              style={{
                background: "var(--accent-cyan)",
                color: "#000",
                border: "2px solid #000",
                boxShadow: "3px 3px 0px #000",
              }}
            >
              AS
            </div>
            <span className="font-bold text-2xl tracking-tight">
              Astra<span style={{ color: "var(--accent-cyan)" }}>.AI</span>
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {mode === "login" ? "Welcome back. Sign in to continue." : "Create your account to get started."}
          </p>
        </div>

        {/* Card */}
        <div
          className="p-8 relative overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "3px solid #333",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Top gradient bar */}
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{
              background: "linear-gradient(90deg, var(--accent-cyan), var(--accent-lime), var(--accent-purple))",
            }}
          />

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              className="nb-btn text-xs py-2 flex-1"
              style={{
                background: mode === "login" ? "var(--accent-cyan)" : "var(--bg-elevated)",
                color: mode === "login" ? "#000" : "var(--text-secondary)",
                border: `3px solid ${mode === "login" ? "var(--accent-cyan)" : "#444"}`,
                fontWeight: 700,
                boxShadow: mode === "login" ? "3px 3px 0px #000" : "none",
              }}
              onClick={() => { setMode("login"); setError(""); }}
            >
              Sign In
            </button>
            <button
              className="nb-btn text-xs py-2 flex-1"
              style={{
                background: mode === "signup" ? "var(--accent-lime)" : "var(--bg-elevated)",
                color: mode === "signup" ? "#000" : "var(--text-secondary)",
                border: `3px solid ${mode === "signup" ? "var(--accent-lime)" : "#444"}`,
                fontWeight: 700,
                boxShadow: mode === "signup" ? "3px 3px 0px #000" : "none",
              }}
              onClick={() => { setMode("signup"); setError(""); }}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                  Full Name
                </label>
                <input
                  className="nb-input"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ padding: "0.7rem 0.9rem", fontSize: "0.9rem" }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                Email
              </label>
              <input
                className="nb-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: "0.7rem 0.9rem", fontSize: "0.9rem" }}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "var(--text-secondary)" }}>
                Password
              </label>
              <input
                className="nb-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ padding: "0.7rem 0.9rem", fontSize: "0.9rem" }}
              />
            </div>

            {error && (
              <div
                className="p-3 text-sm font-bold"
                style={{
                  background: "#ff174411",
                  border: "2px solid var(--accent-red)",
                  color: "var(--accent-red)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="nb-btn w-full py-3 text-sm"
              disabled={loading}
              style={{
                background: mode === "login" ? "var(--accent-cyan)" : "var(--accent-lime)",
                color: "#000",
                border: "3px solid #000",
                boxShadow: "4px 4px 0px #000",
                fontWeight: 700,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="inline-block w-3 h-3"
                    style={{
                      border: "2px solid #000",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "pulse 0.6s linear infinite",
                    }}
                  />
                  {mode === "login" ? "Signing In..." : "Creating Account..."}
                </span>
              ) : mode === "login" ? (
                "Sign In →"
              ) : (
                "Create Account →"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div style={{ flex: 1, height: "1px", background: "#333" }} />
            <span className="mono text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              or continue with
            </span>
            <div style={{ flex: 1, height: "1px", background: "#333" }} />
          </div>

          {/* Google Sign-In */}
          <div id="google-btn-container" className="flex justify-center" />
        </div>

        {/* Footer */}
        <p className="text-center mt-6 mono text-[0.65rem]" style={{ color: "var(--text-muted)" }}>
          Astra.AI — For educational & research purposes only.
        </p>
      </div>
    </div>
  );
}

// Type augmentation for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement | null, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}
