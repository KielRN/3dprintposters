import { spawnSync } from "node:child_process";

const minimumJavaMajorVersion = 21;
const result = spawnSync("java", ["-version"], {
  encoding: "utf8",
});

if (result.error) {
  console.error(
    "Java was not found. Install JDK 21+ before running the full Firebase emulator suite.",
  );
  process.exit(1);
}

const versionOutput = `${result.stderr}\n${result.stdout}`;
const versionMatch = versionOutput.match(/version\s+"([^"]+)"/i);
const version = versionMatch?.[1];
const majorVersion = version ? parseJavaMajorVersion(version) : null;

if (!majorVersion) {
  console.error(
    "Unable to detect the installed Java version. Install JDK 21+ before running the full Firebase emulator suite.",
  );
  process.exit(1);
}

if (majorVersion < minimumJavaMajorVersion) {
  console.error(
    `Detected Java ${version}. The full Firebase emulator suite requires JDK ${minimumJavaMajorVersion}+ locally.`,
  );
  process.exit(1);
}

console.log(
  `Detected Java ${version}. Firebase full emulator suite preflight passed.`,
);

function parseJavaMajorVersion(version) {
  if (version.startsWith("1.")) {
    return Number.parseInt(version.split(".")[1], 10);
  }

  return Number.parseInt(version.split(".")[0], 10);
}
