#!/usr/bin/env bun
/**
 * Run npm publish with NODE_AUTH_TOKEN from .env (Bun loads .env automatically).
 * Usage: bun run publish:local
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
if (!token) {
  console.error("NPM_TOKEN or NODE_AUTH_TOKEN not set in .env");
  process.exit(1);
}

const root = resolve(import.meta.dir, "..");
const npmrcPath = resolve(root, ".npmrc");
const backup = existsSync(npmrcPath) ? readFileSync(npmrcPath, "utf8") : null;
try {
  writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`, "utf8");
  process.env.NODE_AUTH_TOKEN = token;
  const dryRun = process.argv.includes("--dry-run");
  const otp = process.argv.find((a) => a.startsWith("--otp="));
  const args = [
    "publish",
    "--access",
    "public",
    ...(dryRun ? ["--dry-run"] : []),
    ...(otp ? [otp] : []),
  ];
  const r = spawnSync("npm", args, {
    stdio: "inherit",
    env: { ...process.env, NODE_AUTH_TOKEN: token },
    cwd: root,
  });
  process.exit(r.status ?? 1);
} finally {
  if (backup !== null) {
    writeFileSync(npmrcPath, backup, "utf8");
  } else if (existsSync(npmrcPath)) {
    unlinkSync(npmrcPath);
  }
}
