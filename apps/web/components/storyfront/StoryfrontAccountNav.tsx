"use client";

import { getFirebaseClients } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AuthState = "loading" | "signed-in" | "signed-out";

type StoryfrontAccountNavProps = {
  signInHref: string;
  createHref: string;
  signInClassName: string;
  createClassName: string;
  signedInHref?: string;
  signedInLabel?: string;
  className?: string;
};

export function StoryfrontAccountNav({
  signInHref,
  createHref,
  signInClassName,
  createClassName,
  signedInHref,
  signedInLabel,
  className = "flex items-center gap-4 text-sm font-semibold",
}: StoryfrontAccountNavProps) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    if (!firebaseClients) {
      setAuthState("signed-out");
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (user) => {
      setAuthState(user && !user.isAnonymous ? "signed-in" : "signed-out");
    });
  }, [firebaseClients]);

  if (authState === "loading") {
    return <div aria-hidden="true" className={className} />;
  }

  if (authState === "signed-in") {
    if (!signedInHref || !signedInLabel) {
      return null;
    }

    return (
      <nav className={className} aria-label="Account">
        <Link href={signedInHref} className={createClassName}>
          {signedInLabel}
        </Link>
      </nav>
    );
  }

  return (
    <nav className={className} aria-label="Account">
      <Link href={signInHref} className={signInClassName}>
        Sign in
      </Link>
      <Link href={createHref} className={createClassName}>
        Create account
      </Link>
    </nav>
  );
}
