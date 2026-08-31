// Reads API keys from opencode's auth store
// (~/.local/share/opencode/auth.json), shared by every vendor widget.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

import type { AuthEntry } from "./types.js";
import { expandTilde, isRecord } from "./util.js";

export function opencodeAuthPath(envFile?: string): string {
  if (envFile) {
    const raw = env[envFile];
    if (raw && raw.trim())
      return expandTilde(raw.trim());
  }
  const base = env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "opencode", "auth.json");
}

export type OpencodeAuthOptions = {
  // Exact provider ids to try, in order (e.g. "zai-coding-plan", "xai").
  providers: string[];
  // Fallback: any provider id starting with this (case-insensitive).
  providerPrefix: string;
  // Env var that holds a key directly, bypassing the auth file entirely.
  envKey?: string;
  // Env var that holds a custom auth.json path.
  envFile?: string;
  // Error message when no usable key is found.
  missingError: string;
};

// opencode stores two entry shapes: API keys ({type, key}) and OAuth tokens
// ({type, refresh, access, expires}). Normalise both to AuthEntry.
function toAuthEntry(entry: Record<string, unknown>): AuthEntry | null {
  const key = typeof entry.key === "string" && entry.key
    ? entry.key
    : typeof entry.access === "string" && entry.access
      ? entry.access
      : typeof entry.token === "string" && entry.token
        ? entry.token
        : "";
  if (!key)
    return null;
  const auth: AuthEntry = { key };
  const expires = Number(entry.expires);
  if (Number.isFinite(expires) && expires > 0) {
    const ms = expires < 1e12 ? expires * 1000 : expires;
    auth.expires_at = new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return auth;
}

export function loadOpencodeAuth(options: OpencodeAuthOptions): AuthEntry {
  const override = options.envKey ? (env[options.envKey] ?? "").trim() : "";
  if (override)
    return { key: override };

  const path = opencodeAuthPath(options.envFile);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT")
      throw new Error(options.missingError);
    throw new Error(`could not read ${path}`);
  }
  if (isRecord(data)) {
    for (const provider of options.providers) {
      const entry = data[provider];
      if (isRecord(entry)) {
        const auth = toAuthEntry(entry);
        if (auth)
          return auth;
      }
    }
    for (const [name, value] of Object.entries(data)) {
      if (name.toLowerCase().startsWith(options.providerPrefix.toLowerCase()) && isRecord(value)) {
        const auth = toAuthEntry(value);
        if (auth)
          return auth;
      }
    }
  }
  throw new Error(options.missingError);
}
