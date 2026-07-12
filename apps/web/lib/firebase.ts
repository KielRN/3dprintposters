"use client";

import {
  getFirebaseCoreClients,
  type FirebaseCoreClients,
} from "@/lib/firebaseCore";
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

export type FirebaseClients = FirebaseCoreClients & {
  firestore: Firestore;
  storage: FirebaseStorage;
};

let cachedClients: FirebaseClients | null | undefined;
let connectedToFirestoreEmulator = false;
let connectedToStorageEmulator = false;

export function getFirebaseClients(): FirebaseClients | null {
  if (cachedClients !== undefined) {
    return cachedClients;
  }

  const coreClients = getFirebaseCoreClients();
  if (!coreClients) {
    cachedClients = null;
    return cachedClients;
  }

  const firestore = getFirestore(coreClients.app);
  const storage = getStorage(coreClients.app);
  const useAllEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

  if (useAllEmulators && !connectedToFirestoreEmulator) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectedToFirestoreEmulator = true;
  }

  if (useAllEmulators && !connectedToStorageEmulator) {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectedToStorageEmulator = true;
  }

  cachedClients = {
    ...coreClients,
    firestore,
    storage,
  };

  return cachedClients;
}
