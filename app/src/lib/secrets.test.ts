/**
 * Secrets scan — fails the suite if anything credential-shaped lands in the
 * app tree. Runs on plain node fs (fast, deterministic, no network).
 *
 * Scope: the app/ tree reachable from this file (../../), excluding
 * node_modules, dist, .git and gitignored local env files (.env.local).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));   // app/src/lib
const APP_ROOT = join(HERE, "..", "..");                // app/
const SRC_ROOT = join(APP_ROOT, "src");

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite"]);
// This scanner file contains the patterns as source text; skip self.
const SELF = "secrets.test.ts";
// Gitignored local-only files may legitimately hold the anon key on a dev box.
// package-lock integrity hashes are base64 noise that can false-positive the JWT regex.
const SKIP_FILES = new Set([SELF, "package-lock.json", ".env.local", ".env.development.local", ".env.production.local"]);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|md|sql|txt|ya?ml|env|example|toml)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.size < 2_000_000 && (TEXT_EXT.test(name) || name.startsWith(".env"))) out.push(full);
  }
  return out;
}

function offenders(files: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (pattern.test(text)) hits.push(relative(APP_ROOT, f));
  }
  return hits;
}

describe("no secrets in the app tree", () => {
  const appFiles = walk(APP_ROOT);
  const srcFiles = walk(SRC_ROOT);

  it("scans a sane number of files (walk is actually working)", () => {
    expect(appFiles.length).toBeGreaterThan(50);
  });

  it("no JWT-looking tokens anywhere in the app tree", () => {
    expect(offenders(appFiles, /eyJ[A-Za-z0-9_-]{20,}/)).toEqual([]);
  });

  it("no service_role references in src", () => {
    expect(offenders(srcFiles, /service_role/i)).toEqual([]);
  });

  it("no Stripe/Square live credentials anywhere in the app tree", () => {
    expect(offenders(appFiles, /sk_live|sq0atp|sq0csp/)).toEqual([]);
  });

  it(".env is absent (never commit real env files)", () => {
    expect(existsSync(join(APP_ROOT, ".env"))).toBe(false);
  });

  it(".env.example contains only empty placeholder values", () => {
    const example = join(APP_ROOT, ".env.example");
    expect(existsSync(example)).toBe(true);
    const lines = readFileSync(example, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;      // comments / blanks
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
      expect(m, `unparseable line in .env.example: "${line}"`).toBeTruthy();
      const [, key, value] = m!;
      if (key === "VITE_DATA_MODE") {
        expect(value).toBe("demo");
      } else {
        expect(value, `${key} must be an EMPTY placeholder in .env.example`).toBe("");
      }
    }
  });
});
