"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const SIGN_NAME_MAX_CHARACTERS = 12;
const SIGN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;

type BaseSignInlineProps = {
  signText: string;
  normalizedName?: string;
  busy: boolean;
  error?: string;
  notice?: string;
  disabled?: boolean;
  onSave: (input: { signEnabled: boolean; signText: string }) => void;
};

// Customer base-sign block: name input + text-only confirmation. The named
// base itself renders only on operator surfaces.
export function BaseSignInline({
  signText,
  normalizedName,
  busy,
  error,
  notice,
  disabled = false,
  onSave,
}: BaseSignInlineProps) {
  const [text, setText] = useState(signText);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setText(signText);
  }, [signText]);

  const confirmedName = (normalizedName ?? signText).trim();

  function save() {
    const collapsed = text.trim().replace(/\s+/g, " ");
    if (!collapsed) {
      setValidationError("");
      onSave({ signEnabled: false, signText: "" });
      return;
    }
    if (!SIGN_NAME_PATTERN.test(collapsed)) {
      setValidationError(
        "Use letters and numbers, with spaces, periods, apostrophes, or hyphens between them.",
      );
      return;
    }
    setValidationError("");
    onSave({ signEnabled: true, signText: collapsed });
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-bold">Name the base</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Up to 12 letters, printed on the front of the base. Hand-checked
        before printing.
      </p>

      {disabled ? (
        <p className="mt-4 text-sm font-semibold">
          {confirmedName ? (
            <>
              Your base will read:{" "}
              <strong className="tracking-wide">
                {confirmedName.toUpperCase()}
              </strong>
            </>
          ) : (
            "No name on the base."
          )}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className="text-input"
              type="text"
              maxLength={SIGN_NAME_MAX_CHARACTERS}
              placeholder="Ellie"
              aria-label="Name for the figurine base"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={save}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              ) : null}
              Save the name
            </button>
          </div>

          {validationError || error ? (
            <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
              <AlertCircle
                className="mt-0.5 shrink-0"
                size={16}
                aria-hidden="true"
              />
              {validationError || error}
            </p>
          ) : null}

          {notice ? (
            <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--moss)]">
              <CheckCircle2
                className="mt-0.5 shrink-0"
                size={16}
                aria-hidden="true"
              />
              {notice}
            </p>
          ) : null}

          {confirmedName ? (
            <p className="mt-3 text-sm font-semibold">
              Your base will read:{" "}
              <strong className="tracking-wide">
                {confirmedName.toUpperCase()}
              </strong>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
