"use client";

import { firebaseClientConfig } from "@/lib/config";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

export type FirebaseClients = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
};

let cachedClients: FirebaseClients | null | undefined;
let connectedToAuthEmulator = false;
let connectedToFirestoreEmulator = false;
let connectedToFunctionsEmulator = false;
let connectedToStorageEmulator = false;

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
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app);

  const useAllEmulators =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  const useFunctionsEmulator =
    useAllEmulators ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR === "true";

  if (useAllEmulators && !connectedToAuthEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectedToAuthEmulator = true;
  }

  if (useAllEmulators && !connectedToFirestoreEmulator) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectedToFirestoreEmulator = true;
  }

  if (useAllEmulators && !connectedToStorageEmulator) {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectedToStorageEmulator = true;
  }

  if (useFunctionsEmulator && !connectedToFunctionsEmulator) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectedToFunctionsEmulator = true;
  }

  cachedClients = {
    app,
    auth,
    firestore,
    functions,
    storage,
  };

  return cachedClients;
}
