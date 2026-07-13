import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, "..");
const standaloneWebRoot = path.join(webRoot, ".next", "standalone", "apps", "web");
const standaloneServer = path.join(standaloneWebRoot, "server.js");

await stat(standaloneServer);
await mkdir(path.join(standaloneWebRoot, ".next"), { recursive: true });
await cp(path.join(webRoot, "public"), path.join(standaloneWebRoot, "public"), {
  recursive: true,
  force: true
});
await cp(
  path.join(webRoot, ".next", "static"),
  path.join(standaloneWebRoot, ".next", "static"),
  {
    recursive: true,
    force: true
  }
);

console.log("Prepared the standalone Next.js server assets.");
