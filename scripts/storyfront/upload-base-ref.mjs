// One-time upload of the Blender square-base render (raised "Christina"
// nameplate) to Storage for the runtime scene renders. The scene prompt tells
// Vertex to reuse the base's shape but substitute the customer's name.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const localPath = path.join(
  repoRoot,
  ".tmp",
  "storyfront-raw",
  "base",
  "base-view-az000.png",
);
const storagePath = "admin/scene-plates/base-square.png";
const projectId = process.env.GCLOUD_PROJECT ?? "gen-lang-client-0675309660";
const bucketName =
  process.env.APP_STORAGE_BUCKET ?? "gen-lang-client-0675309660.firebasestorage.app";

initializeApp({ projectId, storageBucket: bucketName });

const buffer = await readFile(localPath);
await getStorage().bucket(bucketName).file(storagePath).save(buffer, {
  resumable: false,
  metadata: {
    contentType: "image/png",
    cacheControl: "private, max-age=3600",
    metadata: {
      workflow: "storyfront-scene-base-ref",
      generatedBy: "scripts/storyfront/upload-base-ref.mjs",
    },
  },
});

console.log(`Uploaded ${storagePath} (${buffer.byteLength} bytes)`);
