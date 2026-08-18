import { spawn } from "node:child_process";
import { accessSync, chmodSync, constants, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { env } from "node:process";

import {
  BILLING_URL,
  CACHE_DIR_NAME,
  CACHE_FILE_NAME,
  CLIENT_TYPE,
  CLIENT_VERSION,
  DEFAULT_PLAN,
  DISPLAY_NAME,
  FETCH_TIMEOUT_MS,
  REFRESH_TIMEOUT_MS,
  SETTINGS_URL,
  TOKEN_SKEW_SECONDS,
  USER_AGENT,
  VENDOR_ID,
} from "./consts.js";
import {
  finitePercent,
  formatResetAbsolute,
  productLabel,
  productSortKey,
  severityOf,
} from "./logic.js";
import type { AuthEntry, JsonObject, UsageEntry, UsageReport } from "./types.js";

export { BILLING_URL, SETTINGS_URL } from "./consts.js";

export function grokHome(): string {
  const raw = env.GROK_HOME;
  if (raw)
    return raw.replace(/^~(?=\/|$)/, homedir());
  return join(homedir(), ".grok");
}

export function cachePath(): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, CACHE_DIR_NAME, CACHE_FILE_NAME);
}

export function authPath(): string {
  return join(grokHome(), "auth.json");
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function loadAuth(): AuthEntry {
  const path = authPath();
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT")
      throw new Error("no Grok login found; run `grok login`");
    throw new Error("could not read ~/.grok/auth.json");
  }
  if (!isRecord(data) || Object.keys(data).length === 0)
    throw new Error("Grok login file is empty; run `grok login`");

  const entries: AuthEntry[] = [];
  for (const value of Object.values(data)) {
    if (isRecord(value) && typeof value.key === "string" && value.key)
      entries.push(value as AuthEntry);
  }
  if (entries.length === 0)
    throw new Error("Grok login has no usable token; run `grok login`");
  const preferred = entries.filter((entry) => String(entry.auth_mode ?? "").toLowerCase() === "oidc");
  return preferred[0] ?? entries[0]!;
}

export function tokenExpired(entry: Pick<AuthEntry, "expires_at">, skewSeconds = TOKEN_SKEW_SECONDS): boolean {
  const raw = entry.expires_at;
  if (!raw)
    return false;
  const exp = Date.parse(String(raw).replace("Z", "+00:00"));
  if (!Number.isFinite(exp))
    return false;
  return Date.now() >= exp - skewSeconds * 1000;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function findGrokBinary(): string | null {
  const candidates: string[] = [];
  if (env.GROK_BINARY)
    candidates.push(env.GROK_BINARY.replace(/^~(?=\/|$)/, homedir()));
  candidates.push(join(grokHome(), "bin", "grok"));
  for (const part of (env.PATH ?? "").split(":")) {
    if (part)
      candidates.push(join(part, "grok"));
  }
  const seen = new Set<string>();
  for (const cand of candidates) {
    if (seen.has(cand))
      continue;
    seen.add(cand);
    if (isExecutable(cand))
      return cand;
  }
  return null;
}

export async function nudgeTokenRefresh(): Promise<void> {
  const binary = findGrokBinary();
  if (!binary)
    return;
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: { fs: {}, terminal: false },
      _meta: {
        startupHints: {
          nonInteractive: true,
          skipGitStatus: true,
          skipProjectLayout: true,
        },
        clientType: CLIENT_TYPE,
        clientVersion: CLIENT_VERSION,
      },
    },
  }) + "\n";

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled)
        return;
      settled = true;
      resolve();
    };
    let child;
    try {
      child = spawn(binary, ["agent", "--no-leader", "stdio"], {
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      finish();
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, REFRESH_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      finish();
    });
    child.on("close", () => {
      clearTimeout(timer);
      finish();
    });
    try {
      child.stdin.write(payload);
      child.stdin.end();
    } catch {
      child.kill("SIGKILL");
      clearTimeout(timer);
      finish();
    }
  });
}

export async function httpGetJson(url: string, token: string): Promise<[number, unknown]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-xai-token-auth": "xai-grok-cli",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    let parsed: unknown = { error: "http_error" };
    try {
      parsed = await response.json();
    } catch {
      parsed = { error: "http_error" };
    }
    return [response.status, parsed];
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "AbortError")
      throw new Error("billing request timed out");
    throw new Error("could not fetch SuperGrok usage");
  } finally {
    clearTimeout(timer);
  }
}

export function nowRfc3339(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function reportFromBilling(billing: unknown, plan: string): UsageReport {
  const config = isRecord(billing) && isRecord(billing.config) ? billing.config : {};
  let used = finitePercent(config.creditUsagePercent);
  const period = isRecord(config.currentPeriod) ? config.currentPeriod : {};
  const resetAt = (typeof period.end === "string" && period.end)
    || (typeof config.billingPeriodEnd === "string" && config.billingPeriodEnd)
    || null;

  if (used === null) {
    const onUsed = isRecord(config.onDemandUsed) ? config.onDemandUsed.val : undefined;
    const onCap = isRecord(config.onDemandCap) ? config.onDemandCap.val : undefined;
    const cap = Number(onCap);
    if (Number.isFinite(cap) && cap > 0)
      used = finitePercent(100 * Number(onUsed ?? 0) / cap);
  }
  if (used === null)
    used = 0;

  const products: UsageEntry["product_usage"] = [];
  if (Array.isArray(config.productUsage)) {
    for (const item of config.productUsage) {
      if (!isRecord(item))
        continue;
      const product = String(item.product ?? "").trim();
      const pct = finitePercent(item.usagePercent);
      if (!product || pct === null)
        continue;
      products.push({ product, label: productLabel(product), percent: pct });
    }
  }
  products.sort((a, b) => {
    const ka = productSortKey(a.product);
    const kb = productSortKey(b.product);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
  });

  const usedInt = Math.round(used);
  const severity = severityOf(used);
  return {
    primary: VENDOR_ID,
    entries: [{
      id: VENDOR_ID,
      name: VENDOR_ID,
      display_name: DISPLAY_NAME,
      plan: plan || DEFAULT_PLAN,
      status: "ready",
      stale: false,
      error: "",
      fetched_at: nowRfc3339(),
      used_percent: used,
      reset_at: resetAt,
      reset_label: formatResetAbsolute(resetAt),
      product_usage: products,
      metrics: [{
        id: "weekly",
        label: "Weekly",
        percent: usedInt,
        reset_at: resetAt,
        severity,
      }],
      sections: [{
        type: "metric",
        label: DISPLAY_NAME,
        value: `${usedInt}% used`,
        percent: usedInt,
        reset_at: resetAt,
        severity,
      }],
    }],
  };
}

export function errorReport(message: string, stale?: UsageReport | null): UsageReport {
  const cached = stale?.entries[0];
  if (cached) {
    return {
      primary: VENDOR_ID,
      entries: [{ ...cached, stale: true, error: message, status: "ready" }],
    };
  }
  return {
    primary: VENDOR_ID,
    entries: [{
      id: VENDOR_ID,
      name: VENDOR_ID,
      display_name: DISPLAY_NAME,
      plan: DEFAULT_PLAN,
      status: "error",
      stale: false,
      error: message,
      fetched_at: nowRfc3339(),
      used_percent: null,
      reset_at: null,
      reset_label: "",
      product_usage: [],
      metrics: [],
      sections: [],
    }],
  };
}

export function loadCache(): UsageReport | null {
  try {
    const data: unknown = JSON.parse(readFileSync(cachePath(), "utf8"));
    if (isRecord(data) && Array.isArray(data.entries))
      return data as UsageReport;
  } catch {
    return null;
  }
  return null;
}

export function saveCache(report: UsageReport): void {
  const path = cachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(report));
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } catch {
    // cache is optional
  }
}

export async function fetchLive(): Promise<UsageReport> {
  let entry = loadAuth();
  if (tokenExpired(entry)) {
    await nudgeTokenRefresh();
    entry = loadAuth();
  }

  let [status, billing] = await httpGetJson(BILLING_URL, entry.key);
  if (status === 401 || status === 403) {
    await nudgeTokenRefresh();
    entry = loadAuth();
    [status, billing] = await httpGetJson(BILLING_URL, entry.key);
  }
  if (status === 401 || status === 403)
    throw new Error("Grok login expired; run `grok login`");
  if (status !== 200 || !isRecord(billing) || !("config" in billing))
    throw new Error(`billing request failed (HTTP ${status})`);

  let plan = DEFAULT_PLAN;
  const [settingsStatus, settings] = await httpGetJson(SETTINGS_URL, entry.key);
  if (settingsStatus === 200 && isRecord(settings)) {
    const display = String(settings.subscription_tier_display ?? "").trim();
    if (display)
      plan = display;
  }
  return reportFromBilling(billing, plan);
}

export async function buildReport(): Promise<UsageReport> {
  const cached = loadCache();
  try {
    const report = await fetchLive();
    saveCache(report);
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not fetch SuperGrok usage";
    return errorReport(message, cached);
  }
}

export function printPretty(report: UsageReport): void {
  const entry = report.entries[0];
  if (entry.status === "error") {
    console.log(`⚠  ${entry.error || "error"}`);
    return;
  }
  const used = entry.used_percent;
  const usedTxt = typeof used === "number" ? `${Math.round(used)}%` : "?";
  console.log(`${entry.plan || DEFAULT_PLAN}  ${usedTxt} used`);
  const reset = entry.reset_label || entry.reset_at || "";
  if (reset)
    console.log(`Resets ${reset}`);
  for (const product of entry.product_usage)
    console.log(`  · ${product.label} ${Math.round(product.percent)}%`);
  if (entry.stale)
    console.log(`(stale) ${entry.error}`);
}
