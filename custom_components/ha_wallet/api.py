"""Thin async client for the Wallet by BudgetBakers REST API.

Wraps ``aiohttp`` with Bearer auth, typed errors and parsing of the Wallet
sync/rate-limit response headers. The client is transport-only: it never logs
the token and holds no Home Assistant state. Higher-level polling logic lives in
the coordinator.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

import aiohttp

from .const import (
    API_BASE_URL,
    API_PREFIX,
    HEADER_CHANGE_AT,
    HEADER_CHANGE_REV,
    HEADER_RATELIMIT_LIMIT,
    HEADER_RATELIMIT_REMAINING,
    HEADER_RETRY_AFTER,
    HEADER_SYNC_IN_PROGRESS,
)

_LOGGER = logging.getLogger(__name__)


class WalletApiError(Exception):
    """Base error for the Wallet API client."""


class WalletConnectionError(WalletApiError):
    """Network/transport failure reaching the API."""


class WalletAuthError(WalletApiError):
    """Token missing, invalid or expired (HTTP 401)."""


class WalletInitSyncError(WalletApiError):
    """Initial sync still in progress (HTTP 409); retry later.

    ``retry_after`` is the server hint in seconds when available, else ``None``.
    """

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class WalletRateLimitError(WalletApiError):
    """Hourly request budget exhausted (HTTP 429)."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


@dataclass(slots=True)
class WalletResponseMeta:
    """Sync/rate-limit signals lifted from the response headers.

    All fields are best-effort: any missing header yields ``None`` rather than a
    guessed default, so callers can tell "unknown" apart from a real value.
    """

    change_rev: str | None = None
    change_at: str | None = None
    sync_in_progress: bool | None = None
    ratelimit_limit: int | None = None
    ratelimit_remaining: int | None = None

    @classmethod
    def from_headers(cls, headers: aiohttp.typedefs.LooseHeaders) -> WalletResponseMeta:
        """Build metadata from response headers, tolerating absent/garbage values."""

        def _int(name: str) -> int | None:
            raw = headers.get(name)
            if raw is None:
                return None
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None

        sync_raw = headers.get(HEADER_SYNC_IN_PROGRESS)
        sync = None if sync_raw is None else sync_raw.strip().lower() in ("1", "true", "yes")

        return cls(
            change_rev=headers.get(HEADER_CHANGE_REV),
            change_at=headers.get(HEADER_CHANGE_AT),
            sync_in_progress=sync,
            ratelimit_limit=_int(HEADER_RATELIMIT_LIMIT),
            ratelimit_remaining=_int(HEADER_RATELIMIT_REMAINING),
        )


class WalletApiClient:
    """Minimal transport for the Wallet REST API."""

    def __init__(self, session: aiohttp.ClientSession, token: str) -> None:
        self._session = session
        self._token = token
        # Metadata from the most recent successful response; the coordinator
        # reads it to drive change-rev short-circuiting and rate-limit backoff.
        self.meta = WalletResponseMeta()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: list[tuple[str, str]] | dict[str, Any] | None = None,
        json: Any | None = None,
    ) -> Any:
        """Perform one authenticated request and return the decoded JSON body.

        Response headers are parsed into ``self.meta`` on every non-network
        outcome so rate-limit/sync signals are captured even on error responses.
        """
        url = f"{API_BASE_URL}{API_PREFIX}{path}"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }

        try:
            async with self._session.request(
                method, url, params=params, json=json, headers=headers
            ) as resp:
                self.meta = WalletResponseMeta.from_headers(resp.headers)
                body = await self._decode(resp)
                self._raise_for_status(resp, body)
                return body
        except aiohttp.ClientError as err:
            # Never include ``err`` verbatim in a way that could echo the URL with
            # a token — the token is a header, not in the URL, but stay defensive.
            raise WalletConnectionError(f"Error communicating with Wallet API: {err}") from err

    @staticmethod
    async def _decode(resp: aiohttp.ClientResponse) -> Any:
        """Decode a JSON body, tolerating empty/non-JSON error payloads."""
        if resp.content_length == 0:
            return None
        try:
            return await resp.json()
        except (aiohttp.ContentTypeError, ValueError):
            text = await resp.text()
            return {"error": text} if text else None

    def _raise_for_status(self, resp: aiohttp.ClientResponse, body: Any) -> None:
        """Map HTTP status codes to typed errors. Never surfaces the token."""
        status = resp.status
        if status < 400:
            return

        message = ""
        if isinstance(body, dict):
            message = str(body.get("error", "")).strip()

        if status == HTTPStatus.UNAUTHORIZED:
            raise WalletAuthError(message or "Invalid or expired token")
        if status == HTTPStatus.CONFLICT:
            raise WalletInitSyncError(
                message or "Initial sync in progress",
                retry_after=self._retry_after(resp),
            )
        if status == HTTPStatus.TOO_MANY_REQUESTS:
            raise WalletRateLimitError(
                message or "Rate limit exceeded",
                retry_after=self._retry_after(resp),
            )
        raise WalletApiError(f"Wallet API error {status}: {message or resp.reason}")

    @staticmethod
    def _retry_after(resp: aiohttp.ClientResponse) -> float | None:
        """Parse the ``Retry-After`` header (seconds form) when present."""
        raw = resp.headers.get(HEADER_RETRY_AFTER)
        if raw is None:
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    # --- Endpoints ----------------------------------------------------------

    async def async_get_accounts(self) -> list[dict[str, Any]]:
        """Return the list of accounts.

        Doubles as the token-validation and connectivity probe in the config
        flow: it is a lightweight GET that exercises auth, 409 init-sync and the
        rate-limit headers in one call.
        """
        return await self._get_collection("/accounts", "accounts")

    async def async_get_budgets(self) -> list[dict[str, Any]]:
        """Return budgets, each with API-computed ``spending`` for the period."""
        return await self._get_collection("/budgets", "budgets")

    async def async_get_categories(self) -> list[dict[str, Any]]:
        """Return categories (used for names and the ``cardinality`` field)."""
        return await self._get_collection("/categories", "categories")

    async def async_get_records(
        self,
        *,
        extra_params: list[tuple[str, str]] | None = None,
        limit: int = 200,
        max_pages: int = 25,
        convert_to: str | None = "base",
    ) -> list[dict[str, Any]]:
        """Return records matching ``extra_params``, following pagination.

        ``convert_to`` populates each record's ``convertedAmount`` (default the
        profile base currency) so the coordinator can aggregate across currencies.
        ``max_pages`` caps the request budget: at 200/page it spans 5,000 records
        before truncating (logged), which comfortably covers a single user.
        """
        params: list[tuple[str, str]] = list(extra_params or [])
        if convert_to:
            params.append(("convertTo", convert_to))
        return await self._get_collection(
            "/records", "records", params=params, limit=limit, max_pages=max_pages
        )

    async def _get_collection(
        self,
        path: str,
        key: str,
        *,
        params: list[tuple[str, str]] | None = None,
        limit: int = 200,
        max_pages: int = 25,
    ) -> list[dict[str, Any]]:
        """Fetch a paginated collection, accumulating ``key`` across pages."""
        items: list[dict[str, Any]] = []
        offset = 0
        for page in range(max_pages):
            page_params: list[tuple[str, str]] = list(params or [])
            page_params.append(("limit", str(limit)))
            page_params.append(("offset", str(offset)))
            data = await self._request("GET", path, params=page_params)
            items.extend(self._extract(data, key))
            next_offset = data.get("nextOffset") if isinstance(data, dict) else None
            if next_offset is None:
                return items
            offset = next_offset
        _LOGGER.warning(
            "Reached page cap (%s) fetching %s; results truncated", max_pages, path
        )
        return items

    @staticmethod
    def _extract(data: Any, key: str) -> list[dict[str, Any]]:
        """Pull the item list out of a response, tolerating shape drift."""
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            inner = data.get(key)
            if isinstance(inner, list):
                return inner
        return []
        return []
