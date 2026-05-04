"use client";

import { firebaseClientConfig } from "@/lib/config";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  type Auth
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions
} from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage
} from "firebase/storage";

export type FirebaseClients = {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
  storage: FirebaseStorage;
};

let cachedClients: FirebaseClients | null | undefined;
let connectedToEmulators = false;

export function getFirebaseClients(): FirebaseClients | null {
  if (cachedClients !== undefined) {
    return cachedClients;
  }

  const hasRequiredConfig =
    firebaseClientConfig.apiKey &&
    firebaseClientConfig.authDomain &&
    firebaseClientConfig.projectId &&
    firebaseClientConfig.storageBucket &&
    firebaseClientConfig.appId;

  if (!hasRequiredConfig) {
    cachedClients = null;
    return cachedClients;
  }

  const app =
    getApps().length > 0 ? getApp() : initializeApp(firebaseClientConfig);
  const auth = getAuth(app);
  const storage = getStorage(app);
  const functions = getFunctions(app);

  if (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
    !connectedToEmulators
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true
    });
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectedToEmulators = true;
  }

  cachedClients = {
    app,
    auth,
    functions,
    storage
  };

  return cachedClients;
}
