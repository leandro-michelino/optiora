"""Authentication API endpoints for user registration, login, and profile management."""

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
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
    ensure_public_workspace,
    get_db,
    UserRole,
)
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
security = HTTPBearer(auto_error=False)


PASSWORD_SPECIAL_CHARS = "!@#$%^&*"
PASSWORD_RESET_TOKEN_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_MINUTES", "30"))
PASSWORD_RESET_RETURN_TOKEN = os.getenv(
    "PASSWORD_RESET_RETURN_TOKEN",
    os.getenv("ENVIRONMENT", "development").lower() != "production",
)
_RATE_LIMIT_BUCKETS: Dict[str, List[datetime]] = {}
ACCESS_TOKEN_COOKIE_NAME = "optiora_access_token"
REFRESH_TOKEN_COOKIE_NAME = "optiora_refresh_token"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", os.getenv("ENVIRONMENT", "development").lower() == "production")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")


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
    refresh_token: Optional[str] = None


class SelectOrganizationRequest(BaseModel):
    """Switch the active organization for the current user session."""
    organization_id: int


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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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


def _is_auth_enabled() -> bool:
    return os.getenv("ENABLE_AUTH", "false").strip().lower() in {"1", "true", "yes"}


def _cookie_kwargs(max_age: Optional[int] = None) -> Dict[str, object]:
    """Return consistent cookie attributes for auth tokens."""
    kwargs: Dict[str, object] = {
        "httponly": True,
        "secure": bool(COOKIE_SECURE),
        "samesite": COOKIE_SAMESITE,
        "path": "/",
    }
    if max_age is not None:
        kwargs["max_age"] = max_age
    return kwargs


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HTTP-only cookies for access and refresh tokens."""
    response.set_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        **_cookie_kwargs(max_age=30 * 60),
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        **_cookie_kwargs(max_age=7 * 24 * 60 * 60),
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout and token revocation events."""
    response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, path="/")


def _resolve_membership(user: User, requested_org_id: Optional[int]) -> Optional[UserOrganization]:
    """Resolve a user membership by org_id, or default to the first available membership."""
    memberships = list(user.user_organizations or [])
    if not memberships:
        return None
    if requested_org_id is None:
        return memberships[0]
    for membership in memberships:
        if membership.organization_id == requested_org_id:
            return membership
    return None


def _token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    """Read token from Authorization header first, then access-token cookie."""
    if credentials and credentials.credentials:
        return credentials.credentials
    cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME, "")
    return cookie_token or None


def get_current_token_payload(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Resolve and validate access token payload from header or cookie."""
    if not _is_auth_enabled():
        token = _token_from_request(request, credentials)
        if token:
            payload = verify_access_token(token)
            if payload:
                return payload
        return {}

    token = _token_from_request(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user(
    payload: dict = Depends(get_current_token_payload),
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT Bearer token."""
    if not _is_auth_enabled():
        user, _ = ensure_public_workspace(db)
        return user

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


def get_current_membership(
    current_user: User = Depends(get_current_user),
    payload: dict = Depends(get_current_token_payload),
) -> UserOrganization:
    """Resolve the active org membership from token claim, falling back to primary org."""
    org_id_raw = payload.get("org_id")
    org_id: Optional[int] = None
    try:
        if org_id_raw is not None:
            org_id = int(org_id_raw)
    except (TypeError, ValueError):
        org_id = None

    membership = _resolve_membership(current_user, org_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organization membership found",
        )
    return membership


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
    response: Response,
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
    user_org = db.query(UserOrganization).filter(UserOrganization.user_id == user.id).first()
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
        org_id=org_id,
    )
    
    # Hash and store refresh token
    refresh_token_hash = hash_token(refresh_token)
    
    rt_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(rt_obj)
    
    # Update last login
    user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    
    logger.info("User logged in: %s", user.email)
    _set_auth_cookies(response, access_token, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=30 * 60,  # 30 minutes in seconds
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request_body: RefreshTokenRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Refresh access token using refresh token."""
    incoming_refresh_token = (
        request_body.refresh_token
        or request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
        or ""
    )
    if not incoming_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    payload = verify_refresh_token(incoming_refresh_token)
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
    refresh_token_hash = hash_token(incoming_refresh_token)
    
    rt_obj = db.query(RefreshToken).filter(
        and_(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == refresh_token_hash,
            RefreshToken.is_revoked.is_(False),
            RefreshToken.expires_at > datetime.now(timezone.utc).replace(tzinfo=None),
        )
    ).first()
    
    if not rt_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or revoked",
        )
    
    # Get user's organization
    requested_org_id: Optional[int] = None
    try:
        if payload.get("org_id") is not None:
            requested_org_id = int(payload.get("org_id"))
    except (TypeError, ValueError):
        requested_org_id = None
    user_org = _resolve_membership(user, requested_org_id)
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
        org_id=org_id,
    )
    
    # Revoke old refresh token
    rt_obj.is_revoked = True
    
    # Store new refresh token
    new_rt_hash = hash_token(new_refresh_token)
    new_rt_obj = RefreshToken(
        user_id=user_id,
        token_hash=new_rt_hash,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(new_rt_obj)
    db.commit()
    
    logger.info("Token refreshed for user: %s", user.email)
    _set_auth_cookies(response, access_token, new_refresh_token)
    
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
    
    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(current_user)
    
    logger.info("Profile updated for user: %s", current_user.email)
    
    return current_user


@router.post("/logout")
async def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Logout user by revoking all refresh tokens."""
    
    # Revoke all refresh tokens for this user
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id
    ).update({"is_revoked": True})
    
    db.commit()
    _clear_auth_cookies(response)
    
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
async def get_primary_organization(
    membership: UserOrganization = Depends(get_current_membership),
):
    """Return the active organization membership from the current access token."""
    org = membership.organization
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organization found")
    return OrganizationMembershipResponse(
        id=org.id,
        name=org.name,
        role=membership.role.value,
        plan=org.plan.value,
        is_active=org.is_active,
    )


@router.post("/organization/select", response_model=OrganizationMembershipResponse)
async def select_organization(
    payload: SelectOrganizationRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Switch active org by issuing new access+refresh tokens scoped to the selected org."""
    membership = _resolve_membership(current_user, payload.organization_id)
    if membership is None or membership.organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is not available for this user",
        )
    if not membership.organization.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is inactive",
        )

    access_token = create_access_token(
        user_id=current_user.id,
        email=current_user.email,
        org_id=membership.organization_id,
        role=membership.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=current_user.id,
        email=current_user.email,
        org_id=membership.organization_id,
    )
    new_rt_obj = RefreshToken(
        user_id=current_user.id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(new_rt_obj)
    db.commit()

    _set_auth_cookies(response, access_token, refresh_token)
    return OrganizationMembershipResponse(
        id=membership.organization.id,
        name=membership.organization.name,
        role=membership.role.value,
        plan=membership.organization.plan.value,
        is_active=membership.organization.is_active,
    )


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

    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
            PasswordResetToken.expires_at > datetime.now(timezone.utc).replace(tzinfo=None),
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
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    reset_record.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {"is_revoked": True},
        synchronize_session=False,
    )
    db.commit()

    logger.info("Password reset completed for: %s", user.email)
    return {"message": "Password reset successfully"}
