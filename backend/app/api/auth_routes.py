"""Authentication API routes — signup, login, Google OAuth, profile."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.core.auth import (
    hash_password, verify_password, create_access_token,
    verify_google_token, require_user,
)
from app.core.database import execute_one, execute_query

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Request / Response models ────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# ── Signup ───────────────────────────────────────────────────────

@auth_router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest):
    # Check if email already exists
    existing = execute_one(
        "SELECT id FROM users WHERE email = %s", (req.email,)
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(req.password)
    user = execute_one(
        """INSERT INTO users (email, full_name, password_hash, oauth_provider)
           VALUES (%s, %s, %s, %s)
           RETURNING id, email, full_name, avatar_url, created_at""",
        (req.email, req.full_name, hashed, "local"),
    )

    token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    return AuthResponse(
        token=token,
        user={
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "avatar_url": user["avatar_url"],
        },
    )


# ── Login ────────────────────────────────────────────────────────

@auth_router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    user = execute_one(
        "SELECT id, email, full_name, avatar_url, password_hash FROM users WHERE email = %s",
        (req.email,),
    )
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    return AuthResponse(
        token=token,
        user={
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "avatar_url": user["avatar_url"],
        },
    )


# ── Google OAuth ─────────────────────────────────────────────────

@auth_router.post("/google", response_model=AuthResponse)
async def google_auth(req: GoogleAuthRequest):
    google_user = await verify_google_token(req.id_token)

    # Check if user exists with this email
    user = execute_one(
        "SELECT id, email, full_name, avatar_url FROM users WHERE email = %s",
        (google_user["email"],),
    )

    if user:
        # Update OAuth info
        execute_query(
            """UPDATE users SET oauth_provider = 'google', oauth_id = %s,
               avatar_url = COALESCE(avatar_url, %s)
               WHERE id = %s""",
            (google_user["oauth_id"], google_user["avatar_url"], user["id"]),
            fetch=False,
        )
    else:
        # Create new user
        user = execute_one(
            """INSERT INTO users (email, full_name, oauth_provider, oauth_id, avatar_url)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id, email, full_name, avatar_url""",
            (
                google_user["email"],
                google_user["full_name"],
                "google",
                google_user["oauth_id"],
                google_user["avatar_url"],
            ),
        )

    token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    return AuthResponse(
        token=token,
        user={
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "avatar_url": user.get("avatar_url"),
        },
    )


# ── Get current user ────────────────────────────────────────────

@auth_router.get("/me")
async def get_me(user=Depends(require_user)):
    db_user = execute_one(
        "SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = %s::uuid",
        (user["user_id"],),
    )
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(db_user["id"]),
        "email": db_user["email"],
        "full_name": db_user["full_name"],
        "avatar_url": db_user["avatar_url"],
        "created_at": str(db_user["created_at"]),
    }
