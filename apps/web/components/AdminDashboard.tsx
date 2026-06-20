"use client";

import { getFirebaseClients } from "@/lib/firebase";
import { BriefcaseBusiness, House, Loader2, LogOut, Shield } from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminSupportJobs } from "./AdminSupportJobs";
import { AdminWorkflowConfig } from "./AdminWorkflowConfig";

type AdminTab = "support" | "workflow";

export function AdminDashboard() {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("support");

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

  async function submitSignIn() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the admin app.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(firebaseClients.auth, email, password);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Admin
            </p>
            <h1 className="display mt-1 text-2xl sm:text-3xl">
              Operator console
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="secondary-button h-10 min-h-0 px-3" href="/start">
              <House size={16} aria-hidden="true" />
              Home
            </Link>
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
        </header>

        {!firebaseClients ? (
          <p className="rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
            Add Firebase web env values in{" "}
            <code className="break-all">apps/web/.env.local</code>.
          </p>
        ) : null}

        {authLoading ? (
          <div className="panel flex min-h-40 items-center justify-center gap-3 rounded-lg text-sm font-bold text-[var(--muted)]">
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            Checking admin session
          </div>
        ) : null}

        {!authLoading && !user ? (
          <section className="panel mx-auto grid w-full max-w-lg gap-4 rounded-lg p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Shield className="text-[var(--teal)]" size={22} aria-hidden="true" />
              <h2 className="text-xl font-semibold">Admin sign in</h2>
            </div>
            <label className="grid gap-2 text-sm font-bold">
              Email
              <input
                className="text-input"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Password
              <input
                className="text-input"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submitSignIn();
                  }
                }}
              />
            </label>
            {authError ? (
              <p className="rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
                {authError}
              </p>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={!firebaseClients || authBusy || !email || !password}
              onClick={submitSignIn}
            >
              {authBusy ? (
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              ) : (
                <BriefcaseBusiness size={16} aria-hidden="true" />
              )}
              Sign in
            </button>
          </section>
        ) : null}

        {!authLoading && user ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  className={activeTab === "support" ? "primary-button h-10 min-h-0 px-4" : "secondary-button h-10 min-h-0 px-4"}
                  type="button"
                  onClick={() => setActiveTab("support")}
                >
                  Support jobs
                </button>
                <button
                  className={activeTab === "workflow" ? "primary-button h-10 min-h-0 px-4" : "secondary-button h-10 min-h-0 px-4"}
                  type="button"
                  onClick={() => setActiveTab("workflow")}
                >
                  Workflow controls
                </button>
              </div>
              <p className="max-w-full break-words text-sm font-semibold text-[var(--muted)]">
                {user.email ?? user.uid}
              </p>
            </div>
            {activeTab === "support" ? <AdminSupportJobs active /> : null}
            {activeTab === "workflow" ? (
              <AdminWorkflowConfig
                authLoading={authLoading}
                embedded
                user={user}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
