"""Organization membership resolution and role-based access helpers."""

from __future__ import annotations

from typing import Iterable, Optional

from fastapi import HTTPException, status

from .orm_models import User, UserOrganization, UserRole


ROLE_PRIORITY: dict[UserRole, int] = {
    UserRole.READONLY: 10,
    UserRole.ANALYST: 20,
    UserRole.ADMIN: 30,
    UserRole.OWNER: 40,
}


def primary_membership(user: User) -> Optional[UserOrganization]:
    """Resolve the user's active organization context."""
    memberships = [membership for membership in user.user_organizations if membership.organization]
    if not memberships:
        return None

    token_org_id = getattr(user, "_token_org_id", None)
    if token_org_id is not None:
        for membership in memberships:
            if membership.organization_id == token_org_id:
                return membership

    memberships.sort(
        key=lambda membership: (
            -ROLE_PRIORITY.get(membership.role, 0),
            membership.added_at.isoformat() if membership.added_at else "",
            membership.organization_id,
        )
    )
    return memberships[0]


def resolve_membership(user: User, organization_id: Optional[int] = None) -> UserOrganization:
    """Return a membership for the requested organization or the primary one."""
    if organization_id is None:
        membership = primary_membership(user)
        if membership:
            return membership
    else:
        for membership in user.user_organizations:
            if membership.organization_id == organization_id and membership.organization:
                return membership

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No accessible organization membership found",
    )


def organization_scope_id(membership: UserOrganization) -> str:
    return f"org-{membership.organization_id}"


def legacy_user_scope_id(user: User) -> str:
    return f"user-{user.id}"


def scope_candidates(primary_scope: str, aliases: Optional[Iterable[str]] = None) -> list[str]:
    ordered = [primary_scope, *(aliases or [])]
    unique: list[str] = []
    for candidate in ordered:
        normalized = str(candidate or "").strip()
        if normalized and normalized not in unique:
            unique.append(normalized)
    return unique


def require_role(
    membership: UserOrganization,
    allowed_roles: Iterable[UserRole],
    action: str,
) -> None:
    allowed = set(allowed_roles)
    if membership.role in allowed:
        return

    expected = ", ".join(sorted(role.value for role in allowed))
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"{action} requires one of: {expected}",
    )
