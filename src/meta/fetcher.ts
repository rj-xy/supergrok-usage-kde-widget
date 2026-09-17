// Meta AI (Muse coding subscription) usage fetcher for the Meta Plasma widget.
//
// The `muse` TUI's /usage panel reads the `response.subscription_usage`
// server-sent-event frame from the Meta model API; there is no separate
// quota endpoint, so each refresh makes one minimal streaming /responses
// call (a few tokens) and closes the stream as soon as the usage frame
// arrives. The credential is the `muse login` token from
// ~/.config/muse/auth.json (`providers.meta`), falling back to opencode's
// `meta` entry, or META_API_KEY.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

import { cachePathFor, loadCachedReport, saveCachedReport } from "../cache.js";
import { httpPostSse } from "../http.js";
import { finitePercent, formatResetAbsolute, severityOf } from "../logic.js";
import { loadOpencodeAuth } from "../opencode.js";
import { errorReportFor } from "../report.js";
import type { AuthEntry, UsageEntry, UsageMetric, UsageReport } from "../types.js";
import { expandTilde, isRecord, nowRfc3339 } from "../util.js";
import {
  AUTH_PROVIDER,
  CACHE_DIR_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_PLAN,
  DISPLAY_NAME,
  RESPONSES_PATH,
  USAGE_PROBE_INPUT,
  USAGE_PROBE_MAX_TOKENS,
  USER_AGENT,
  VENDOR_ID,
} from "./consts.js";

export { RESPONSES_PATH, SUBSCRIPTION_URL } from "./consts.js";

export type UsageWindow = {
  usedPercent: number | null;
  durationMins: number | null;
  resetsAt: string | null;
};

export type SubscriptionUsage = {
  tier: string;
  window: UsageWindow;
  weekly: UsageWindow;
};

export function museAuthPath(): string {
  const override = (env.MUSE_AUTH_PATH ?? "").trim();
  if (override)
    return expandTilde(override);
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "muse", "auth.json");
}

export function museSettingsPath(): string {
  const override = (env.MUSE_SETTINGS_PATH ?? "").trim();
  if (override)
    return expandTilde(override);
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "muse", "settings.json");
}

export type MuseSlot = {
  key: string;
  apiBaseUrl: string;
};

// META_API_KEY first (the `muse` CLI documents it as taking priority), else
// the `meta` slot of the muse auth file (`api_key`, then `access_token`).
export function readMuseSlot(): MuseSlot | null {
  const override = (env.META_API_KEY ?? "").trim();
  if (override)
    return { key: override, apiBaseUrl: "" };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(museAuthPath(), "utf8"));
  } catch {
    return null;
  }
  const providers = isRecord(data) ? data["providers"] : undefined;
  const slot = isRecord(providers) ? providers["meta"] : undefined;
  if (!isRecord(slot))
    return null;
  const apiKey = slot["api_key"];
  const accessToken = slot["access_token"];
  const key = typeof apiKey === "string" && apiKey
    ? apiKey
    : typeof accessToken === "string" ? accessToken : "";
  if (!key)
    return null;
  const apiBaseUrl = slot["api_base_url"];
  return {
    key,
    apiBaseUrl: typeof apiBaseUrl === "string" ? apiBaseUrl.trim() : "",
  };
}

export function loadAuth(): AuthEntry {
  const slot = readMuseSlot();
  if (slot)
    return { key: slot.key };
  return loadOpencodeAuth({
    providers: [AUTH_PROVIDER],
    providerPrefix: "meta",
    envFile: "META_AUTH_FILE",
    missingError: "no Meta login found; run `muse login` (or sign in with Meta in opencode)",
  });
}

function stripTrailingSlashes(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveBaseUrl(): string {
  const override = stripTrailingSlashes(env.META_BASE_URL ?? "");
  if (override)
    return override;
  const fromAuth = stripTrailingSlashes(readMuseSlot()?.apiBaseUrl ?? "");
  if (fromAuth)
    return fromAuth;
  try {
    const data: unknown = JSON.parse(readFileSync(museSettingsPath(), "utf8"));
    const transport = isRecord(data) ? data["endpoint_transport"] : undefined;
    const base = isRecord(transport) ? transport["base_url"] : undefined;
    if (typeof base === "string" && stripTrailingSlashes(base))
      return stripTrailingSlashes(base);
  } catch {
    // fall through to the default
  }
  return DEFAULT_BASE_URL;
}

export function resolveModel(): string {
  return (env.META_MODEL ?? "").trim() || DEFAULT_MODEL;
}

function pick(record: unknown, ...names: string[]): unknown {
  if (!isRecord(record))
    return undefined;
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value !== null)
      return value;
  }
  return undefined;
}

// Normalize a reset stamp (epoch seconds/millis, or ISO-8601) to RFC 3339.
function toRfc3339(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0)
      return null;
    const ms = value < 1e11 ? value * 1000 : value;
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text)
      return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      const numeric = Number(text);
      if (!Number.isFinite(numeric) || numeric <= 0)
        return null;
      const ms = numeric < 1e11 ? numeric * 1000 : numeric;
      return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
    }
    const ms = Date.parse(text);
    if (!Number.isFinite(ms))
      return null;
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return null;
}

function toWindow(raw: unknown): UsageWindow {
  const duration = Number(pick(raw, "window_duration_mins", "windowDurationMins"));
  return {
    usedPercent: finitePercent(pick(raw, "used_percent", "usedPercent")),
    durationMins: Number.isFinite(duration) && duration > 0 ? duration : null,
    resetsAt: toRfc3339(pick(raw, "resets_at", "resetsAtMs", "resetsAtms", "resetsAt")),
  };
}

function tierOf(payload: unknown): string {
  const tier = pick(payload, "tier", "plan", "tier_id", "tierId");
  if (typeof tier === "string")
    return tier.trim();
  return typeof tier === "number" && Number.isFinite(tier) ? String(tier) : "";
}

export function parseSubscriptionEvent(event: unknown): SubscriptionUsage | null {
  if (!isRecord(event))
    return null;
  // Live shape nests the payload under `subscription`; tolerate flat and
  // camelCase spellings.
  const payload = isRecord(event["subscription"]) ? event["subscription"] : event;
  const window = toWindow(pick(payload, "window"));
  const weekly = toWindow(pick(payload, "weekly"));
  if (window.usedPercent === null && weekly.usedPercent === null) {
    // Flat fallback: usage fields beside the type marker.
    const flat = toWindow(payload);
    if (flat.usedPercent === null)
      return null;
    return {
      tier: tierOf(payload),
      window: flat,
      weekly: { usedPercent: null, durationMins: null, resetsAt: null },
    };
  }
  return { tier: tierOf(payload), window, weekly };
}

export function planFromTier(tier: string): string {
  const name = tier.trim();
  // The API currently returns an opaque numeric tier id; only adopt
  // human-looking tier names as the plan label.
  if (name && /[A-Za-z]/.test(name) && name.length <= 60)
    return name;
  return DEFAULT_PLAN;
}

export function reportFromSubscription(
  usage: SubscriptionUsage,
  plan = planFromTier(usage.tier),
): UsageReport {
  // Weekly only: the 5-hour window is ignored, so the popup shows a single
  // progress bar like the Grok widget.
  const weekly = usage.weekly;
  if (weekly.usedPercent === null)
    throw new Error("subscription usage had no weekly window");

  const used = weekly.usedPercent;
  const rounded = Math.round(used);
  const severity = severityOf(used);
  const metrics: UsageMetric[] = [{
    id: "weekly",
    label: "Weekly",
    percent: rounded,
    reset_at: weekly.resetsAt,
    severity,
  }];

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
      reset_at: weekly.resetsAt,
      reset_label: formatResetAbsolute(weekly.resetsAt),
      product_usage: [],
      metrics,
      sections: [{
        type: "metric",
        label: DISPLAY_NAME,
        value: `${rounded}% used`,
        percent: rounded,
        reset_at: weekly.resetsAt,
        severity,
      }],
    }],
  };
}

export function errorReport(message: string, stale?: UsageReport | null): UsageReport {
  return errorReportFor(
    { id: VENDOR_ID, displayName: DISPLAY_NAME, defaultPlan: DEFAULT_PLAN },
    message,
    stale,
  );
}

export function cachePath(): string {
  return cachePathFor(CACHE_DIR_NAME);
}

export function loadCache(): UsageReport | null {
  return loadCachedReport(cachePath());
}

export function saveCache(report: UsageReport): void {
  saveCachedReport(cachePath(), report);
}

function serverErrorDetail(bodyText: string): string {
  try {
    const data: unknown = JSON.parse(bodyText);
    if (!isRecord(data))
      return "";
    const message = pick(data, "message");
    if (typeof message === "string" && message.trim())
      return message.trim().slice(0, 300);
    const error = data["error"];
    if (isRecord(error)) {
      const nested = pick(error, "message");
      const code = pick(error, "code", "type");
      const text = typeof nested === "string" ? nested.trim() : "";
      const prefix = typeof code === "string" && code.trim() ? `${code.trim()}: ` : "";
      if (text)
        return `${prefix}${text}`.slice(0, 300);
    }
  } catch {
    // not JSON; fall through
  }
  return "";
}

export async function fetchLive(): Promise<UsageReport> {
  const auth = loadAuth();
  const baseUrl = resolveBaseUrl();
  const model = resolveModel();
  let frame: SubscriptionUsage | null = null;
  let sawUsageType = false;
  const result = await httpPostSse(
    `${baseUrl}${RESPONSES_PATH}`,
    auth.key,
    {
      model,
      input: USAGE_PROBE_INPUT,
      stream: true,
      max_output_tokens: USAGE_PROBE_MAX_TOKENS,
    },
    {
      userAgent: USER_AGENT,
      timeoutError: "usage request timed out",
      networkError: "could not fetch Meta AI usage",
    },
    (event) => {
      if (!isRecord(event) || event["type"] !== "response.subscription_usage")
        return false;
      sawUsageType = true;
      frame = parseSubscriptionEvent(event);
      return frame !== null;
    },
  );
  if (result.status === 401 || result.status === 403)
    throw new Error("Meta login expired; run `muse login` or check META_API_KEY");
  if (result.status !== 200) {
    const detail = serverErrorDetail(result.bodyText);
    const suffix = detail ? ` — ${detail}` : "";
    const lowered = detail.toLowerCase();
    const hint = detail && lowered.includes("model")
      && (lowered.includes("not found") || lowered.includes("unknown"))
      ? " (check META_MODEL)"
      : "";
    throw new Error(`usage request failed (HTTP ${result.status})${suffix}${hint}`);
  }
  if (!result.contentType.includes("text/event-stream")) {
    // Non-streaming reply: look for an inline usage object, else bail.
    try {
      const data: unknown = JSON.parse(result.bodyText);
      const candidate = pick(data, "subscription_usage", "subscriptionUsage", "subscription");
      frame = isRecord(candidate) ? parseSubscriptionEvent(candidate) : null;
    } catch {
      frame = null;
    }
  }
  if (!frame) {
    if (sawUsageType)
      throw new Error("subscription usage frame was unparseable (API shape changed?)");
    if (result.contentType.includes("text/event-stream") && !result.sawEvents)
      throw new Error("usage request returned an empty stream");
    throw new Error("usage response had no subscription usage frame");
  }
  return reportFromSubscription(frame);
}

export async function buildReport(): Promise<UsageReport> {
  const cached = loadCache();
  try {
    const report = await fetchLive();
    saveCache(report);
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not fetch Meta AI usage";
    return errorReport(message, cached);
  }
}

export function printPretty(report: UsageReport): void {
  const entry = report.entries[0];
  if (!entry)
    return;
  if (entry.status === "error") {
    console.log(`⚠  ${entry.error || "error"}`);
    return;
  }
  const used = entry.used_percent;
  const usedTxt = typeof used === "number" ? `${Math.round(used)}%` : "?";
  console.log(`${entry.plan || DEFAULT_PLAN}  ${usedTxt} used`);
  for (const metric of entry.metrics) {
    const parts = [`${metric.label} ${Math.round(metric.percent)}%`];
    if (metric.value)
      parts.push(metric.value);
    const reset = formatResetAbsolute(metric.reset_at);
    if (reset)
      parts.push(`resets ${reset}`);
    console.log(`  · ${parts.join(" · ")}`);
  }
  if (entry.stale)
    console.log(`(stale) ${entry.error}`);
}
