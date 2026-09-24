import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: projectRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function pkgVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const full =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  sh("git rev-parse HEAD") ||
  "dev";
const short = full === "dev" ? "dev" : full.slice(0, 7);
const message =
  process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim() ||
  sh("git log -1 --pretty=%s") ||
  "";
const builtAt = new Date().toISOString();
const day = builtAt.slice(0, 10).replace(/-/g, ".");
/** Ex.: 2026.09.23-0c6ab44 — muda a cada commit/build */
const version = `${day}-${short}`;
const display = `${pkgVersion()}+${short}`;

const outDir = join(projectRoot, "src", "generated");
mkdirSync(outDir, { recursive: true });

const ts = `/* Gerado automaticamente no build — não edite. */
export const BUILD_INFO = {
  version: ${JSON.stringify(version)},
  display: ${JSON.stringify(display)},
  commit: ${JSON.stringify(short)},
  commitFull: ${JSON.stringify(full)},
  message: ${JSON.stringify(message)},
  builtAt: ${JSON.stringify(builtAt)},
  packageVersion: ${JSON.stringify(pkgVersion())},
} as const;
`;

writeFileSync(join(outDir, "build-info.ts"), ts, "utf8");
writeFileSync(
  join(projectRoot, "public", "version.json"),
  JSON.stringify(
    {
      version,
      display,
      commit: short,
      commitFull: full,
      message,
      builtAt,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`[build-info] ${version} (${display})`);
