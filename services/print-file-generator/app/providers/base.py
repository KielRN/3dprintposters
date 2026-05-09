"""Common types for provider chains."""

from __future__ import annotations

from dataclasses import dataclass, field


class ProviderError(Exception):
    """Recoverable failure in a single provider invocation.

    A chain catches this and falls through to the next provider. Use this
    for: HTTP non-200, timeout, missing credentials, missing optional
    deps, model output that fails validation. Use plain ``Exception``
    for programmer errors.
    """


class AllProvidersFailedError(Exception):
    """Every provider in a chain has failed."""

    def __init__(
        self,
        attempted: list[str],
        last_error: BaseException | None = None,
    ) -> None:
        self.attempted = list(attempted)
        self.last_error = last_error
        message = f"All providers failed. Attempted: {attempted}."
        if last_error is not None:
            message += f" Last error: {last_error!r}"
        super().__init__(message)


@dataclass(frozen=True)
class ProviderAudit:
    """Audit fields written to job metadata after a chain executes.

    Attributes:
        succeeded: provider_id that produced the result.
        attempted: provider_ids tried before the successful one. Empty on
            first-try success.
        fallback_reason: short string describing why the chain fell through
            (e.g. ``"api_5xx"``, ``"timeout"``, ``"missing_credentials"``).
            None on first-try success.
    """

    succeeded: str
    attempted: tuple[str, ...] = field(default_factory=tuple)
    fallback_reason: str | None = None
