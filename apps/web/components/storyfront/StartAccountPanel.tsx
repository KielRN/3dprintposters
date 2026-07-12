"use client";

import { AuthPanel } from "@/components/AuthPanel";
import { getFirebaseClients } from "@/lib/firebase";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

type AuthIntent = "sign-in" | "create";

// Renders the account form as a dismissible modal over /start. Opening is
// driven by the `?auth=` param (set by the header links); closing clears it.
export function StartAccountPanel({ authIntent }: { authIntent: AuthIntent }) {
  const router = useRouter();
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!firebaseClients) {
      setAuthLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [firebaseClients]);

  const close = useCallback(() => {
    router.push("/start", { scroll: false });
  }, [router]);

  // Escape to close, lock body scroll, and move focus into the dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  // Once a real account is signed in there is nothing left to do here.
  const signedIn = Boolean(user && !user.isAnonymous);
  useEffect(() => {
    if (signedIn) {
      close();
    }
  }, [signedIn, close]);

  const creating = authIntent === "create";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="modal-backdrop absolute inset-0 bg-[var(--ink)]/45 backdrop-blur-sm"
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="modal-card panel relative z-10 w-full max-w-sm rounded-2xl p-6 outline-none sm:p-7"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--clay)]/70 hover:text-[var(--ink)]"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <h2 id="auth-modal-title" className="display pr-8 text-xl">
          {creating ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {creating
            ? "Save your figurines and track every order."
            : "Sign in to pick up where you left off."}
        </p>

        <div className="mt-5">
          <AuthPanel
            chrome={false}
            user={user}
            authLoading={authLoading}
            firebaseClients={firebaseClients}
            initialMode={authIntent}
            prompt="Create an account or sign in to start your figurine."
          />
        </div>
      </div>
    </div>
  );
}
