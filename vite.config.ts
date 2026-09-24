import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function ensureBuildInfo() {
  try {
    execSync("node scripts/write-build-info.mjs", {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    // segue com fallback
  }
}

ensureBuildInfo();

function readGenerated() {
  const path = join(root, "src", "generated", "build-info.ts");
  if (!existsSync(path)) {
    return {
      version: "0.0.0-dev",
      display: "0.0.0+dev",
      commit: "dev",
      commitFull: "dev",
      builtAt: new Date().toISOString(),
    };
  }
  const raw = readFileSync(path, "utf8");
  const pick = (key) => {
    const m = raw.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m?.[1] ?? "";
  };
  return {
    version: pick("version") || "0.0.0-dev",
    display: pick("display") || "0.0.0+dev",
    commit: pick("commit") || "dev",
    commitFull: pick("commitFull") || "dev",
    builtAt: pick("builtAt") || new Date().toISOString(),
  };
}

const info = readGenerated();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(info.version),
    __APP_DISPLAY__: JSON.stringify(info.display),
    __APP_COMMIT__: JSON.stringify(info.commit),
    __APP_COMMIT_FULL__: JSON.stringify(info.commitFull),
    __APP_BUILD_TIME__: JSON.stringify(info.builtAt),
  },
});
