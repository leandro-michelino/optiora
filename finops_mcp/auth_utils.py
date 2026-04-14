"""Authentication utilities: JWT, password hashing, and token generation."""

from datetime import datetime, timedelta
from typing import Optional
import hashlib
import os

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # 30 minutes
REFRESH_TOKEN_EXPIRE_DAYS = 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# Schemas
class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: int  # user_id
    email: str
    org_id: Optional[int] = None
    role: Optional[str] = None
    exp: datetime
    iat: datetime


class User(BaseModel):
    """User response schema."""
    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    email_verified: bool
    created_at: datetime


# Password utilities
def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    """Return deterministic hash for token persistence/lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# JWT utilities
def create_access_token(
    user_id: int,
    email: str,
    org_id: Optional[int] = None,
    role: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT access token."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    expire = datetime.utcnow() + expires_delta
    to_encode = {
        "sub": user_id,
        "email": email,
        "org_id": org_id,
        "role": role,
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(user_id: int, email: str) -> str:
    """Create JWT refresh token."""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[dict]:
    """Verify access token and return payload."""
    try:
        payload = decode_token(token)
        if payload is None:
            return None
        
        # Ensure it's not a refresh token
        if payload.get("type") == "refresh":
            return None
        
        return payload
    except Exception:
        return None


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verify refresh token and return payload."""
    try:
        payload = decode_token(token)
        if payload is None:
            return None
        
        # Ensure it's a refresh token
        if payload.get("type") != "refresh":
            return None
        
        return payload
    except Exception:
        return None
