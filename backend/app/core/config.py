"""Application configuration."""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = "Astra"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # LLM
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    LLM_PRIMARY_MODEL: str = "llama-3.1-8b-instant"
    LLM_FALLBACK_MODEL: str = "llama-3.1-8b-instant"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 2048
    LLM_TIMEOUT: int = 15

    # Voice / Whisper
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"
    VOICE_LLM_MODEL: str = "llama-3.1-8b-instant"
    VOICE_MAX_TOKENS: int = 512
    VOICE_TEMPERATURE: float = 0.3

    # Twilio WhatsApp
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM: str = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    # Alpha Vantage (optional — for data fallback)
    ALPHA_VANTAGE_KEY: str = os.getenv("ALPHA_VANTAGE_KEY", "")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./Astra.db")

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "astra_default_secret_change_me")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRY_MINUTES: int = int(os.getenv("JWT_EXPIRY_MINUTES", "1440"))

    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # Defaults
    DEFAULT_LOOKBACK: str = "2y"
    DEFAULT_TIMEFRAME: str = "1d"
    DEFAULT_CAPITAL_INR: float = 1_000_000
    DEFAULT_CAPITAL_USD: float = 100_000

    # Cache
    CACHE_TTL_SECONDS: int = 3600  # 1 hour


settings = Settings()
