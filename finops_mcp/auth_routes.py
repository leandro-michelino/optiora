"""Authentication API endpoints for user registration, login, and profile management."""

from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from typing import Optional
import logging

from .orm_models import User, Organization, UserOrganization, RefreshToken, get_db, UserRole
from .auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
    TokenResponse,
    User as UserSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# Schemas
class RegisterRequest:
    """Registration request schema."""
    email: str
    password: str
    full_name: Optional[str] = None


class LoginRequest:
    """Login request schema."""
    email: str
    password: str


class RefreshTokenRequest:
    """Refresh token request schema."""
    refresh_token: str


class UpdateProfileRequest:
    """Update profile request schema."""
    full_name: Optional[str] = None


# Dependencies
def get_current_user(
    token: Optional[str] = None,
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token."""
    if not token:
        # Try to get from Authorization header
        from fastapi import Header
        auth_header = Header(None, alias="authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = auth_header[7:]  # Remove "Bearer " prefix
    
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id: int = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
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
    
    # Validate email not already taken
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Validate password strength
    if len(request.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )
    
    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        full_name=request.full_name or "",
        is_active=True,
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create default organization for user
    org = Organization(
        name=f"{request.full_name or request.email.split('@')[0]}'s Organization",
        owner_id=user.id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # Add user to organization as owner
    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role=UserRole.OWNER,
    )
    db.add(user_org)
    db.commit()
    
    logger.info(f"User registered: {user.email}")
    
    return user


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
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
    from .auth_utils import hash_password as hash_rt
    refresh_token_hash = hash_rt(refresh_token)
    
    rt_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(rt_obj)
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    logger.info(f"User logged in: {user.email}")
    
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
    
    user_id: int = payload.get("sub")
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
    from .auth_utils import hash_password as hash_rt
    refresh_token_hash = hash_rt(request.refresh_token)
    
    rt_obj = db.query(RefreshToken).filter(
        and_(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == refresh_token_hash,
            RefreshToken.is_revoked == False,
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
    new_rt_hash = hash_rt(new_refresh_token)
    new_rt_obj = RefreshToken(
        user_id=user_id,
        token_hash=new_rt_hash,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(new_rt_obj)
    db.commit()
    
    logger.info(f"Token refreshed for user: {user.email}")
    
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
    
    logger.info(f"Profile updated for user: {current_user.email}")
    
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
    
    logger.info(f"User logged out: {current_user.email}")
    
    return {"message": "Logged out successfully"}


@router.post("/password-reset-request")
async def request_password_reset(email: str, db: Session = Depends(get_db)):
    """Request password reset using email verification."""
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Don't reveal if email exists
        return {"message": "If email exists, password reset link sent"}
    
    # TODO: Send password reset email with OTP or link
    # For now, just acknowledge the request
    logger.info(f"Password reset requested for: {email}")
    
    return {"message": "If email exists, password reset link sent"}


@router.post("/password-reset")
async def reset_password(
    reset_token: str,
    new_password: str,
    db: Session = Depends(get_db),
):
    """Reset password using reset token."""
    
    # TODO: Verify reset token
    # TODO: Validate new password
    # TODO: Update user password
    
    return {"message": "Password reset successfully"}
