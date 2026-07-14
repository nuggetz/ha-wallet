"""Thin async client for the Wallet by BudgetBakers REST API.

Wraps ``aiohttp`` with Bearer auth, typed errors and parsing of the Wallet
sync/rate-limit response headers. The client is transport-only: it never logs
the token and holds no Home Assistant state. Higher-level polling logic lives in
the coordinator.
"""

from __future__ import annotations

import logging
import re
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

_LIMIT_CAP_RE = re.compile(r"at most (\d+)")


def _parse_limit_cap(message: str) -> int | None:
    """Extract N from a "limit must be at most N" validation message."""
    match = _LIMIT_CAP_RE.search(message)
    return int(match.group(1)) if match else None


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


class WalletValidationError(WalletApiError):
    """Request rejected as invalid (HTTP 400).

    Carries the decoded ``body`` so batch endpoints (whose per-item failures are
    reported in the 400 body) can surface the specific reason.
    """

    def __init__(self, message: str, body: Any = None) -> None:
        super().__init__(message)
        self.body = body


class WalletRecordError(WalletApiError):
    """A single record was rejected by the batch create/patch endpoint.

    ``error_type`` is ``client_error`` (bad input, e.g. a bank-synced account)
    or ``server_error``.
    """

    def __init__(self, message: str, error_type: str | None = None) -> None:
        super().__init__(message)
        self.error_type = error_type


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
        if status == HTTPStatus.BAD_REQUEST:
            # Batch endpoints report per-item failures in the 400 body; keep it.
            raise WalletValidationError(message or "Invalid request", body=body)
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

    async def async_get_goals(self) -> list[dict[str, Any]]:
        """Return savings goals (read-only)."""
        return await self._get_collection("/goals", "goals")

    async def async_get_standing_orders(self) -> list[dict[str, Any]]:
        """Return recurring standing orders."""
        return await self._get_collection("/standing-orders", "standingOrders")

    async def async_get_record_rules(self) -> list[dict[str, Any]]:
        """Return record auto-categorisation rules."""
        return await self._get_collection("/record-rules", "recordRules")

    async def async_get_labels(self) -> list[dict[str, Any]]:
        """Return labels (for id discovery and applying via label_ids)."""
        return await self._get_collection("/labels", "labels")

    async def async_get_records(
        self,
        *,
        extra_params: list[tuple[str, str]] | None = None,
        limit: int = 200,
        max_pages: int = 50,
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

    async def async_create_record(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create one record and return its result item (with the new ``id``).

        The endpoint is a batch: we send a single-item array and read the one
        result back. Per-item failures (e.g. a write to a bank-synced account)
        arrive either in a 207/200 body or as a 400 body — both are unwrapped
        into a :class:`WalletRecordError` carrying the API's own message.
        """
        return await self._batch_write("POST", "/records", payload)

    async def async_update_record(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Patch one record (``patch`` must include ``id``); return its result."""
        return await self._batch_write("PATCH", "/records", patch)

    async def async_delete_record(self, record_id: str) -> dict[str, Any]:
        """Delete one record by id; return its result item."""
        return await self._batch_write(
            "DELETE", "/records", None, body={"ids": [record_id]}
        )

    async def async_create_entity(
        self, path: str, payload: dict[str, Any], result_key: str
    ) -> dict[str, Any]:
        """POST a single object (budget/category/account/label) and return it.

        Create endpoints wrap the entity as ``{<result_key>: {...}}`` and report
        invalid input as a plain 400 (surfaced via :class:`WalletValidationError`).
        """
        body = await self._request("POST", path, json=payload)
        if isinstance(body, dict) and isinstance(body.get(result_key), dict):
            return body[result_key]
        return body if isinstance(body, dict) else {}

    async def async_patch_entity(
        self, entity_type: str, item: dict[str, Any]
    ) -> dict[str, Any]:
        """PATCH one entity of ``entity_type`` (must include ``id``)."""
        return await self._batch_write("PATCH", f"/{entity_type}", item)

    async def async_delete_entity(
        self, entity_type: str, entity_id: str
    ) -> dict[str, Any]:
        """DELETE one entity of ``entity_type`` by id."""
        return await self._batch_write(
            "DELETE", f"/{entity_type}", None, body={"ids": [entity_id]}
        )

    async def async_get_references(self, ref_type: str, entity_id: str) -> dict[str, Any]:
        """Return what references an entity (pre-delete safety check)."""
        data = await self._request(
            "GET", f"/{ref_type}/references", params=[("id", entity_id)]
        )
        return data if isinstance(data, dict) else {}

    async def _batch_write(
        self,
        method: str,
        path: str,
        item: dict[str, Any] | None,
        *,
        body: Any = None,
    ) -> dict[str, Any]:
        """Send a single-item batch write and unwrap the one result.

        Create/patch send ``[item]``; delete sends an explicit ``{"ids": [...]}``
        body. Per-item failures (e.g. a bank-synced account, a locked
        ``uncleared`` record) surface as :class:`WalletRecordError` whether the
        API reports them in a 200/207 body or as a 400.
        """
        json_body = body if body is not None else [item]
        try:
            resp = await self._request(method, path, json=json_body)
        except WalletValidationError as err:
            resp = err.body  # batch 400: the per-item reason is inside the body

        results = self._extract(resp, "results")
        if not results:
            raise WalletApiError(f"Wallet API returned no result for {method} {path}")
        result = results[0]
        if result.get("error") or result.get("errorType"):
            raise WalletRecordError(
                result.get("error") or "Operation was rejected",
                error_type=result.get("errorType"),
            )
        return result

    async def _get_collection(
        self,
        path: str,
        key: str,
        *,
        params: list[tuple[str, str]] | None = None,
        limit: int = 20,
        max_pages: int = 60,
    ) -> list[dict[str, Any]]:
        """Fetch a paginated collection, accumulating ``key`` across pages.

        The documented per-page ``limit`` maximum (200) is not enforced
        uniformly by the server — some endpoints reject anything over 20. If a
        page is rejected with "limit must be at most N", we adopt N and retry,
        so the client adapts to whatever cap the endpoint actually applies.
        """
        items: list[dict[str, Any]] = []
        offset = 0
        for _page in range(max_pages):
            page_params: list[tuple[str, str]] = list(params or [])
            page_params.append(("limit", str(limit)))
            page_params.append(("offset", str(offset)))
            try:
                data = await self._request("GET", path, params=page_params)
            except WalletValidationError as err:
                capped = _parse_limit_cap(str(err))
                if capped is not None and capped < limit:
                    limit = capped
                    continue  # retry this offset with the accepted limit
                raise
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
