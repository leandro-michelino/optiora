"""Authentication API endpoints for user registration, login, and profile management."""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import os
import re
import secrets

from .orm_models import (
    User,
    Organization,
    UserOrganization,
    RefreshToken,
    PasswordResetToken,
    get_db,
    UserRole,
)
from .access_control import primary_membership, resolve_membership
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
optional_security = HTTPBearer(auto_error=False)


PASSWORD_SPECIAL_CHARS = "!@#$%^&*"
PASSWORD_RESET_TOKEN_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_MINUTES", "30"))
PASSWORD_RESET_RETURN_TOKEN = os.getenv(
    "PASSWORD_RESET_RETURN_TOKEN",
    os.getenv("ENVIRONMENT", "development").lower() != "production",
)
_RATE_LIMIT_BUCKETS: Dict[str, List[datetime]] = {}


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


class PasswordResetRequest(BaseModel):
    """Password reset request schema."""
    email: EmailStr


class PasswordResetResponse(BaseModel):
    """Password reset request response."""
    message: str
    reset_token: Optional[str] = None
    expires_in_minutes: Optional[int] = None


class ResetPasswordRequest(BaseModel):
    """Password reset completion schema."""
    reset_token: str
    new_password: str


class OrganizationMembershipResponse(BaseModel):
    """Authenticated user's organization membership."""
    id: int
    name: str
    role: str
    plan: str
    is_active: bool


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


def _client_ip(request: Request) -> str:
    """Resolve a rate-limit client key from standard proxy headers."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """In-process fixed-window rate limiting for auth abuse protection."""
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=window_seconds)
    attempts = [
        timestamp for timestamp in _RATE_LIMIT_BUCKETS.get(key, []) if timestamp > window_start
    ]
    if len(attempts) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
        )
    attempts.append(now)
    _RATE_LIMIT_BUCKETS[key] = attempts


def _should_return_reset_token() -> bool:
    """Expose reset tokens only for local/dev flows without a mail provider."""
    if isinstance(PASSWORD_RESET_RETURN_TOKEN, bool):
        return PASSWORD_RESET_RETURN_TOKEN
    return str(PASSWORD_RESET_RETURN_TOKEN).strip().lower() in {"1", "true", "yes"}


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

    user._token_org_id = payload.get("org_id")
    user._token_role = payload.get("role")
    return user


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Return the authenticated user when available, otherwise None."""
    if credentials is None:
        return None

    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        return None

    user_id_raw = payload.get("sub")
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        return None

    user._token_org_id = payload.get("org_id")
    user._token_role = payload.get("role")
    return user


def get_current_membership(
    current_user: User,
    organization_id: Optional[int] = None,
) -> UserOrganization:
    """Resolve a membership for the current user."""
    return resolve_membership(current_user, organization_id=organization_id)


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
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Authenticate user and return JWT tokens."""
    normalized_email = _normalize_email(str(payload.email))
    _check_rate_limit(f"login:{_client_ip(request)}:{normalized_email}", limit=8, window_seconds=900)

    # Find user by email
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    # Verify password
    if not verify_password(payload.password, user.password_hash):
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
    user_org = primary_membership(user)
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
    user_org = primary_membership(user)
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


@router.get("/organizations", response_model=list[OrganizationMembershipResponse])
async def list_organizations(current_user: User = Depends(get_current_user)):
    """List organizations available to the authenticated user."""
    memberships: list[OrganizationMembershipResponse] = []
    for membership in current_user.user_organizations:
        org = membership.organization
        if org is None:
            continue
        memberships.append(
            OrganizationMembershipResponse(
                id=org.id,
                name=org.name,
                role=membership.role.value,
                plan=org.plan.value,
                is_active=org.is_active,
            )
        )
    return memberships


@router.get("/organization", response_model=OrganizationMembershipResponse)
async def get_primary_organization(current_user: User = Depends(get_current_user)):
    """Return the user's primary organization membership."""
    memberships = await list_organizations(current_user)
    if not memberships:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organization found")
    return memberships[0]


@router.post("/password-reset-request", response_model=PasswordResetResponse)
async def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a one-time password reset token without revealing account existence."""
    normalized_email = _normalize_email(str(payload.email))
    _check_rate_limit(f"password-reset:{_client_ip(request)}:{normalized_email}", 5, 3600)

    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        # Don't reveal if email exists
        return PasswordResetResponse(message="If email exists, password reset link sent")

    now = datetime.utcnow()
    db.query(PasswordResetToken).filter(
        and_(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    ).update({"used_at": now}, synchronize_session=False)

    reset_token = secrets.token_urlsafe(32)
    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(reset_token),
        expires_at=now + timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES),
    )
    db.add(reset_record)
    db.commit()

    logger.info("Password reset requested for: %s", normalized_email)

    response = PasswordResetResponse(
        message="If email exists, password reset link sent",
        expires_in_minutes=PASSWORD_RESET_TOKEN_MINUTES,
    )
    if _should_return_reset_token():
        response.reset_token = reset_token
    return response


@router.post("/password-reset")
async def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Reset password using reset token."""
    password_error = _validate_password_strength(payload.new_password)
    if password_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    token_hash = hash_token(payload.reset_token)
    reset_record = db.query(PasswordResetToken).filter(
        and_(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    ).first()
    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is invalid or expired",
        )

    user = db.query(User).filter(User.id == reset_record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is invalid or expired",
        )

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    reset_record.used_at = datetime.utcnow()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {"is_revoked": True},
        synchronize_session=False,
    )
    db.commit()

    logger.info("Password reset completed for: %s", user.email)
    return {"message": "Password reset successfully"}
