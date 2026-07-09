"use client";

import type { FirebaseClients } from "@/lib/firebase";
import { AlertCircle, Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

type AuthMode = "sign-in" | "create";

type AuthPanelProps = {
  user: User | null;
  authLoading: boolean;
  firebaseClients: FirebaseClients | null;
};

// Extracted from UploadFlow's account block: email/password sign-in, account
// creation, and guest sessions. The parent owns the onAuthStateChanged
// listener and passes user/authLoading down.
export function AuthPanel({ user, authLoading, firebaseClients }: AuthPanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  async function submitAuth() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      if (authMode === "create") {
        await createUserWithEmailAndPassword(
          firebaseClients.auth,
          authEmail,
          authPassword,
        );
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

  async function continueAsGuest() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      await signInAnonymously(firebaseClients.auth);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Guest sign-in failed.",
      );
    } finally {
      setAuthBusy(false);
    }
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
                ? (user.email ?? "Guest session")
                : "Sign in to upload a source photo."}
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

      {!firebaseClients ? (
        <p className="mt-3 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          Add Firebase web env values in{" "}
          <code className="break-all">apps/web/.env.local</code>.
        </p>
      ) : null}

      {firebaseClients && !authLoading && !user ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className={
                authMode === "sign-in" ? "primary-button" : "secondary-button"
              }
              type="button"
              onClick={() => setAuthMode("sign-in")}
            >
              <LogIn size={16} aria-hidden="true" />
              Sign in
            </button>
            <button
              className={
                authMode === "create" ? "primary-button" : "secondary-button"
              }
              type="button"
              onClick={() => setAuthMode("create")}
            >
              <UserPlus size={16} aria-hidden="true" />
              Create
            </button>
          </div>
          <input
            className="text-input"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
          />
          <input
            className="text-input"
            type="password"
            autoComplete={
              authMode === "create" ? "new-password" : "current-password"
            }
            placeholder="Password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="primary-button"
              type="button"
              disabled={authBusy || !authEmail || authPassword.length < 6}
              onClick={submitAuth}
            >
              {authBusy ? (
                <Loader2
                  className="animate-spin"
                  size={16}
                  aria-hidden="true"
                />
              ) : (
                <LogIn size={16} aria-hidden="true" />
              )}
              {authMode === "create" ? "Create account" : "Sign in"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={authBusy}
              onClick={continueAsGuest}
            >
              Continue as guest
            </button>
          </div>
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
      ) : null}
    </div>
  );
}
