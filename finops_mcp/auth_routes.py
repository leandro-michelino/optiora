"""Authentication API endpoints for user registration, login, and profile management."""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from typing import Optional
import logging
import re

from .orm_models import User, Organization, UserOrganization, RefreshToken, get_db, UserRole
from .auth_utils import (
    hash_password,
    verify_password,
    hash_token,
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
    TokenResponse,
    User as UserSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


PASSWORD_SPECIAL_CHARS = "!@#$%^&*"


# Schemas
class RegisterRequest(BaseModel):
    """Registration request schema."""
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    """Refresh token request schema."""
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    """Update profile request schema."""
    full_name: Optional[str] = None


# Dependencies
def _normalize_email(email: str) -> str:
    """Normalize email addresses for consistent storage and lookup."""
    return email.strip().lower()


def _validate_password_strength(password: str) -> Optional[str]:
    """Keep server-side password rules aligned with the dashboard signup flow."""
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain a number"
    if not any(char in PASSWORD_SPECIAL_CHARS for char in password):
        return "Password must contain special character (!@#$%^&*)"
    return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT Bearer token."""
    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return user


# Endpoints
@router.post("/register", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    normalized_email = _normalize_email(str(request.email))

    # Validate email not already taken
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate password strength
    password_error = _validate_password_strength(request.password)
    if password_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=password_error,
        )

    try:
        # Create user and default organization atomically to avoid orphaned users.
        user = User(
            email=normalized_email,
            password_hash=hash_password(request.password),
            full_name=(request.full_name or "").strip(),
            is_active=True,
        )
        db.add(user)
        db.flush()

        org_owner_name = request.full_name or normalized_email.split("@")[0]
        org = Organization(
            name=f"{org_owner_name}'s Organization",
            owner_id=user.id,
        )
        db.add(org)
        db.flush()

        user_org = UserOrganization(
            user_id=user.id,
            organization_id=org.id,
            role=UserRole.OWNER,
        )
        db.add(user_org)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        logger.exception("User registration failed for %s", normalized_email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account",
        )

    logger.info("User registered: %s", user.email)

    return user


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    normalized_email = _normalize_email(str(request.email))

    # Find user by email
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    
    # Get user's primary organization
    user_org = db.query(UserOrganization).filter(
        UserOrganization.user_id == user.id
    ).first()
    
    org_id = user_org.organization_id if user_org else None
    role = user_org.role.value if user_org else None
    
    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        org_id=org_id,
        role=role,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        email=user.email,
    )
    
    # Hash and store refresh token
    refresh_token_hash = hash_token(refresh_token)
    
    rt_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(rt_obj)
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    logger.info("User logged in: %s", user.email)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=30 * 60,  # 30 minutes in seconds
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""

    # Verify refresh token
    payload = verify_refresh_token(request.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token subject",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    
    # Check if refresh token is revoked
    refresh_token_hash = hash_token(request.refresh_token)
    
    rt_obj = db.query(RefreshToken).filter(
        and_(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == refresh_token_hash,
            RefreshToken.is_revoked.is_(False),
            RefreshToken.expires_at > datetime.utcnow(),
        )
    ).first()
    
    if not rt_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or revoked",
        )
    
    # Get user's organization
    user_org = db.query(UserOrganization).filter(
        UserOrganization.user_id == user_id
    ).first()
    
    org_id = user_org.organization_id if user_org else None
    role = user_org.role.value if user_org else None
    
    # Create new tokens
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        org_id=org_id,
        role=role,
    )
    new_refresh_token = create_refresh_token(
        user_id=user.id,
        email=user.email,
    )
    
    # Revoke old refresh token
    rt_obj.is_revoked = True
    
    # Store new refresh token
    new_rt_hash = hash_token(new_refresh_token)
    new_rt_obj = RefreshToken(
        user_id=user_id,
        token_hash=new_rt_hash,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(new_rt_obj)
    db.commit()
    
    logger.info("Token refreshed for user: %s", user.email)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=30 * 60,
    )


@router.get("/profile", response_model=UserSchema)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile."""
    return current_user


@router.put("/profile", response_model=UserSchema)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user's profile."""
    
    if request.full_name:
        current_user.full_name = request.full_name
    
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    
    logger.info("Profile updated for user: %s", current_user.email)
    
    return current_user


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Logout user by revoking all refresh tokens."""
    
    # Revoke all refresh tokens for this user
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id
    ).update({"is_revoked": True})
    
    db.commit()
    
    logger.info("User logged out: %s", current_user.email)
    
    return {"message": "Logged out successfully"}


@router.post("/password-reset-request")
async def request_password_reset(email: str, db: Session = Depends(get_db)):
    """Request password reset using email verification."""
    normalized_email = _normalize_email(email)
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        # Don't reveal if email exists
        return {"message": "If email exists, password reset link sent"}
    
    # TODO: Send password reset email with OTP or link
    # For now, just acknowledge the request
    logger.info("Password reset requested for: %s", normalized_email)
    
    return {"message": "If email exists, password reset link sent"}


@router.post("/password-reset")
async def reset_password(
    reset_token: str,
    new_password: str,
    db: Session = Depends(get_db),
):
    """Reset password using reset token."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Password reset via token is not yet implemented",
    )
