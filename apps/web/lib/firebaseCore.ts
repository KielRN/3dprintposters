"use client";

import { firebaseClientConfig } from "@/lib/config";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";

export type FirebaseCoreClients = {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
};

let cachedCoreClients: FirebaseCoreClients | null | undefined;
let connectedToAuthEmulator = false;
let connectedToFunctionsEmulator = false;

export function getFirebaseCoreClients(): FirebaseCoreClients | null {
  if (cachedCoreClients !== undefined) {
    return cachedCoreClients;
  }

  const hasRequiredConfig =
    firebaseClientConfig.apiKey &&
    firebaseClientConfig.authDomain &&
    firebaseClientConfig.projectId &&
    firebaseClientConfig.storageBucket &&
    firebaseClientConfig.appId;

  if (!hasRequiredConfig) {
    cachedCoreClients = null;
    return cachedCoreClients;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseClientConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app);
  const useAllEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  const useFunctionsEmulator =
    useAllEmulators ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR === "true";

  if (useAllEmulators && !connectedToAuthEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectedToAuthEmulator = true;
  }

  if (useFunctionsEmulator && !connectedToFunctionsEmulator) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectedToFunctionsEmulator = true;
  }

  cachedCoreClients = { app, auth, functions };
  return cachedCoreClients;
}
