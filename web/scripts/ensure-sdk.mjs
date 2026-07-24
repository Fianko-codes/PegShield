// Ensures @pegshield/sdk is built before the web app compiles.
// The web app consumes the SDK over a `file:../sdk` dependency, which needs its
// compiled `dist/`. This is a no-op when dist already exists; otherwise it tries
// to build it, and if that isn't possible, prints a clear instruction instead of
// failing cryptically. All logic stays inside web/ — the SDK itself is untouched.

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_DIR = resolve(__dirname, "..", "..", "sdk");
const SDK_DIST = join(SDK_DIR, "dist", "index.js");

if (existsSync(SDK_DIST)) {
  process.exit(0);
}

if (!existsSync(SDK_DIR)) {
  console.warn("[ensure-sdk] ../sdk not found — assuming @pegshield/sdk is resolved elsewhere.");
  process.exit(0);
}

try {
  if (!existsSync(join(SDK_DIR, "node_modules"))) {
    console.log("[ensure-sdk] installing SDK dependencies…");
    // The SDK is compiled with tsc, so it needs its devDependencies
    // (typescript, @types/node, @solana/web3.js types). Hosts like Vercel run
    // the build with NODE_ENV=production, which makes a bare `npm install` omit
    // devDependencies — so force them in explicitly for this nested install.
    execSync("npm install --include=dev", {
      cwd: SDK_DIR,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    });
  }
  console.log("[ensure-sdk] building @pegshield/sdk…");
  execSync("npm run build", { cwd: SDK_DIR, stdio: "inherit" });
} catch {
  console.error(
    "\n[ensure-sdk] Could not build @pegshield/sdk automatically.\n" +
      "  Build it once, then retry:\n" +
      "    npm --prefix ../sdk install && npm --prefix ../sdk run build\n",
  );
  process.exit(1);
}
