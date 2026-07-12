"use client";

import type { FirebaseCoreClients } from "@/lib/firebaseCore";
import { AlertCircle, Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

type AuthMode = "sign-in" | "create";

type AuthPanelProps = {
  user: User | null;
  authLoading: boolean;
  firebaseClients: FirebaseCoreClients | null;
  focusRequestKey?: number;
  initialMode?: AuthMode;
  prompt?: string;
  // When false, the account-creation toggle is hidden and only sign-in is
  // offered. Used by role-gated consoles (operator/admin) where accounts must
  // be provisioned and granted roles out-of-band, not self-created.
  allowCreate?: boolean;
  // When false, the outer card and the "Account" header/sign-out row are
  // dropped so the form can sit inside a host surface (e.g. a modal) that
  // supplies its own title and chrome.
  chrome?: boolean;
};

// Email/password sign-in and account creation. The parent owns the
// onAuthStateChanged listener and passes user/authLoading down.
export function AuthPanel({
  user,
  authLoading,
  firebaseClients,
  focusRequestKey = 0,
  initialMode = "sign-in",
  prompt,
  allowCreate = true,
  chrome = true,
}: AuthPanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(
    allowCreate ? initialMode : "sign-in",
  );
  // When creation is disabled, sign-in is the only valid mode regardless of
  // any stale state left over from a mode toggle.
  const effectiveMode: AuthMode = allowCreate ? authMode : "sign-in";
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequestKey > 0) {
      setAuthMode(allowCreate ? initialMode : "sign-in");
      emailInputRef.current?.focus();
    }
  }, [focusRequestKey, initialMode, allowCreate]);

  async function submitAuth() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      if (effectiveMode === "create") {
        if (user?.isAnonymous) {
          await linkWithCredential(
            user,
            EmailAuthProvider.credential(authEmail, authPassword),
          );
        } else {
          await createUserWithEmailAndPassword(
            firebaseClients.auth,
            authEmail,
            authPassword,
          );
        }
      } else {
        await signInWithEmailAndPassword(
          firebaseClients.auth,
          authEmail,
          authPassword,
        );
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  const hasAccount = Boolean(user && !user.isAnonymous);

  const notConfigured = !firebaseClients ? (
    <p className="rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
      Add Firebase web env values in{" "}
      <code className="break-all">apps/web/.env.local</code>.
    </p>
  ) : null;

  const form =
    firebaseClients && !authLoading && !hasAccount ? (
      <div className="grid gap-3">
        {allowCreate ? (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--clay)]/70 p-1">
            {(["sign-in", "create"] as const).map((mode) => {
              const active = authMode === mode;
              const Icon = mode === "sign-in" ? LogIn : UserPlus;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAuthMode(mode)}
                  // Inline font overrides the global `button { font: inherit }`
                  // reset, which otherwise wins over Tailwind's layered utilities.
                  style={{ fontSize: "0.875rem", fontWeight: 600 }}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg transition-colors ${
                    active
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {mode === "sign-in" ? "Sign in" : "Create"}
                </button>
              );
            })}
          </div>
        ) : null}
        <input
          ref={emailInputRef}
          className="text-input"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={authEmail}
          onChange={(event) => setAuthEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submitAuth();
            }
          }}
        />
        <input
          className="text-input"
          type="password"
          autoComplete={
            effectiveMode === "create" ? "new-password" : "current-password"
          }
          placeholder="Password"
          value={authPassword}
          onChange={(event) => setAuthPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submitAuth();
            }
          }}
        />
        <button
          className="button-primary-compact mt-1 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] focus-visible:ring-offset-2"
          type="button"
          disabled={authBusy || !authEmail || authPassword.length < 6}
          onClick={submitAuth}
        >
          {authBusy ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : (
            <LogIn size={16} aria-hidden="true" />
          )}
          {effectiveMode === "create" ? "Create account" : "Sign in"}
        </button>
        {authError ? (
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
            <AlertCircle
              className="mt-0.5 shrink-0"
              size={16}
              aria-hidden="true"
            />
            {authError}
          </p>
        ) : null}
      </div>
    ) : null;

  // Bare mode: the host (e.g. a modal) provides its own title/close chrome, so
  // render only the configuration notice and the form.
  if (!chrome) {
    return (
      <div className="grid gap-3">
        {notConfigured}
        {form}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Account</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {authLoading
              ? "Checking session..."
              : user
                ? hasAccount
                  ? (user.email ?? "Signed-in account")
                  : allowCreate
                    ? "Create an account to continue."
                    : "Sign in to continue."
                : (prompt ??
                  (allowCreate
                    ? "Create an account to upload a source photo."
                    : "Sign in to continue."))}
          </p>
        </div>
        {user ? (
          <button
            className="secondary-button h-10 min-h-0 px-3"
            type="button"
            onClick={() => {
              if (firebaseClients) {
                void signOut(firebaseClients.auth);
              }
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        ) : null}
      </div>

      {notConfigured ? <div className="mt-3">{notConfigured}</div> : null}
      {form ? <div className="mt-4">{form}</div> : null}
    </div>
  );
}
