// Z.ai (GLM Coding Plan) usage fetcher for the Z.ai Plasma widget.
// The quota endpoint is undocumented (derived from z.ai's own tooling) and
// can change without notice. The API key is the one opencode stores in
// ~/.local/share/opencode/auth.json under "zai-coding-plan".

import { cachePathFor, loadCachedReport, saveCachedReport } from "../cache.js";
import { httpGetJson } from "../http.js";
import { finitePercent, formatResetAbsolute, severityOf } from "../logic.js";
import { loadOpencodeAuth, opencodeAuthPath } from "../opencode.js";
import { errorReportFor } from "../report.js";
import type { AuthEntry, JsonObject, UsageEntry, UsageMetric, UsageReport } from "../types.js";
import { isRecord, nowRfc3339 } from "../util.js";
import {
  API_TZ_OFFSET_MS,
  AUTH_PROVIDER,
  CACHE_DIR_NAME,
  DEFAULT_PLAN,
  DISPLAY_NAME,
  FIVE_HOUR_MS,
  MODEL_USAGE_URL,
  QUOTA_URL,
  UNIT_5H,
  UNIT_WEEKLY,
  USER_AGENT,
  VENDOR_ID,
  WEEK_MS,
  modelColor,
  modelLabel,
} from "./consts.js";

export { QUOTA_URL, SUBSCRIPTION_URL, UNIT_5H, UNIT_WEEKLY } from "./consts.js";

export type QuotaRecord = {
  unit: number;
  limit: number;
  used: number;
  remaining: number | null;
  percentage: number | null;
  resetAt: string | null;
};

export type ModelSummary = {
  model: string;
  tokens: number;
};

export function authPath(): string {
  return opencodeAuthPath("ZAI_AUTH_FILE");
}

export function loadAuth(): AuthEntry {
  return loadOpencodeAuth({
    providers: [AUTH_PROVIDER],
    providerPrefix: "zai",
    envKey: "ZAI_API_KEY",
    envFile: "ZAI_AUTH_FILE",
    missingError: "no z.ai coding-plan key; sign in with the GLM Coding Plan in opencode",
  });
}

function epochMsToRfc3339(value: unknown): string | null {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0)
    return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toQuotaRecord(raw: unknown): QuotaRecord | null {
  if (!isRecord(raw))
    return null;
  const unit = Number(raw.unit);
  if (!Number.isFinite(unit))
    return null;
  const limit = Number(raw.usage);
  const used = Number(raw.currentValue);
  const remaining = Number(raw.remaining);
  const percentage = Number(raw.percentage);
  if (!Number.isFinite(limit) && !Number.isFinite(used)
    && !Number.isFinite(remaining) && !Number.isFinite(percentage))
    return null;
  return {
    unit: unit,
    limit: Number.isFinite(limit) ? limit : Number.NaN,
    used: Number.isFinite(used) ? used : Number.NaN,
    remaining: Number.isFinite(remaining) ? remaining : null,
    percentage: Number.isFinite(percentage) ? percentage : null,
    resetAt: epochMsToRfc3339(raw.nextResetTime),
  };
}

export function collectQuotaRecords(body: unknown): QuotaRecord[] {
  const out: QuotaRecord[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || out.length >= 16)
      return;
    if (Array.isArray(value)) {
      for (const item of value)
        visit(item, depth + 1);
      return;
    }
    if (!isRecord(value))
      return;
    const record = toQuotaRecord(value);
    if (record)
      out.push(record);
    for (const child of Object.values(value))
      visit(child, depth + 1);
  };
  visit(body, 0);
  return out;
}

function firstForUnit(records: QuotaRecord[], unit: number): QuotaRecord | null {
  for (const record of records) {
    if (record.unit === unit)
      return record;
  }
  return null;
}

// "YYYY-MM-DD HH:mm:ss" in the API's timezone (UTC+8), as the monitor API expects.
export function formatApiTime(ms: number): string {
  return new Date(ms + API_TZ_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

export function parseModelSummaries(body: unknown): ModelSummary[] {
  const found = new Map<string, number>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || found.size >= 24)
      return;
    if (Array.isArray(value)) {
      for (const item of value)
        visit(item, depth + 1);
      return;
    }
    if (!isRecord(value))
      return;
    const name = typeof value.modelName === "string" && value.modelName
      ? value.modelName
      : (typeof value.model === "string" ? value.model : "");
    if (name) {
      const tokens = Number(value.totalTokens ?? value.tokens ?? value.usage ?? value.credits);
      if (Number.isFinite(tokens) && tokens >= 0)
        found.set(name, Math.max(found.get(name) ?? 0, tokens));
    }
    for (const child of Object.values(value))
      visit(child, depth + 1);
  };
  visit(body, 0);
  return [...found]
    .map(([model, tokens]) => ({ model, tokens }))
    .filter((summary) => summary.tokens > 0);
}

export async function fetchModelSummaries(
  token: string,
  startMs: number,
  endMs: number,
): Promise<ModelSummary[]> {
  // Pad the end so the server always clamps to "now" instead of an earlier bucket.
  const params = new URLSearchParams({
    startTime: formatApiTime(startMs),
    endTime: formatApiTime(endMs + 60 * 60 * 1000),
  });
  try {
    const [status, body] = await getJson(`${MODEL_USAGE_URL}?${params.toString()}`, token);
    if (status !== 200)
      return [];
    return parseModelSummaries(body);
  } catch {
    return [];
  }
}

// Splits usedPercent across models by token share (the API exposes tokens, not
// credits, per model), so the segments always sum to the window's used percent.
export function modelSegments(
  summaries: ModelSummary[],
  usedPercent: number,
  maxSegments = 6,
): UsageEntry["product_usage"] {
  const total = summaries.reduce((sum, summary) => sum + summary.tokens, 0);
  if (!(total > 0) || !(usedPercent > 0))
    return [];
  const sorted = [...summaries].sort((a, b) => b.tokens - a.tokens);
  let models = sorted;
  if (sorted.length > maxSegments) {
    const head = sorted.slice(0, maxSegments - 1);
    const rest = sorted.slice(maxSegments - 1)
      .reduce((sum, summary) => sum + summary.tokens, 0);
    head.push({ model: "other", tokens: rest });
    models = head;
  }
  const segments: UsageEntry["product_usage"] = [];
  models.forEach((summary, index) => {
    const percent = usedPercent * summary.tokens / total;
    if (!(percent > 0))
      return;
    const isOther = summary.model === "other";
    segments.push({
      product: summary.model,
      label: isOther ? "Other" : modelLabel(summary.model),
      percent: percent,
      color: isOther ? "#94A3B8" : modelColor(summary.model, index),
    });
  });
  return segments;
}

export function windowPercent(record: QuotaRecord): number | null {
  if (record.limit > 0 && Number.isFinite(record.used))
    return finitePercent(100 * record.used / record.limit);
  return finitePercent(record.percentage);
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function windowCredits(record: QuotaRecord): string {
  if (record.limit > 0 && Number.isFinite(record.used))
    return `${formatCredits(record.used)} / ${formatCredits(record.limit)} credits`;
  if (record.remaining !== null && record.remaining >= 0)
    return `${formatCredits(record.remaining)} credits left`;
  return "";
}

function windowMetric(record: QuotaRecord, id: string, label: string): UsageMetric | null {
  const percent = windowPercent(record);
  if (percent === null)
    return null;
  const credits = windowCredits(record);
  const metric: UsageMetric = {
    id: id,
    label: label,
    percent: Math.round(percent),
    reset_at: record.resetAt,
    severity: severityOf(percent),
  };
  if (credits)
    metric.value = credits;
  return metric;
}

export function reportFromQuota(body: unknown, plan = DEFAULT_PLAN): UsageReport {
  const records = collectQuotaRecords(body);
  const fiveHours = firstForUnit(records, UNIT_5H);
  const weekly = firstForUnit(records, UNIT_WEEKLY);
  const primary = fiveHours ?? weekly;
  if (!primary)
    throw new Error("quota response had no 5-hour or weekly window");

  const used = windowPercent(primary) ?? 0;

  const metrics: UsageMetric[] = [];
  const sections: UsageEntry["sections"] = [];
  const windows: Array<[QuotaRecord, string, string]> = [];
  if (fiveHours)
    windows.push([fiveHours, "5h", "5-hour window"]);
  if (weekly)
    windows.push([weekly, "weekly", "Weekly"]);
  for (const [record, id, label] of windows) {
    const metric = windowMetric(record, id, label);
    if (!metric)
      continue;
    metrics.push(metric);
    sections.push({
      type: "metric",
      label: label,
      value: metric.value ? `${metric.percent}% used · ${metric.value}` : `${metric.percent}% used`,
      percent: metric.percent,
      reset_at: metric.reset_at,
      severity: metric.severity,
    });
  }

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
      reset_at: primary.resetAt,
      reset_label: formatResetAbsolute(primary.resetAt),
      product_usage: [],
      metrics: metrics,
      sections: sections,
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

function getJson(url: string, token: string): Promise<[number, unknown]> {
  return httpGetJson(url, token, {
    userAgent: USER_AGENT,
    timeoutError: "quota request timed out",
    networkError: "could not fetch Z.ai usage",
  });
}

export async function fetchLive(): Promise<UsageReport> {
  const auth = loadAuth();
  const [status, body] = await getJson(QUOTA_URL, auth.key);
  if (status === 401 || status === 403)
    throw new Error("z.ai key rejected; sign in to the GLM Coding Plan in opencode again");
  if (status !== 200)
    throw new Error(`quota request failed (HTTP ${status})`);
  const report = reportFromQuota(body);

  // Model split for the primary window (5-hour, or weekly when that is all the
  // account has). Optional: a failure here keeps the quota-only report.
  const records = collectQuotaRecords(body);
  const fiveHours = firstForUnit(records, UNIT_5H);
  const primary = fiveHours ?? firstForUnit(records, UNIT_WEEKLY);
  if (primary) {
    const duration = fiveHours ? FIVE_HOUR_MS : WEEK_MS;
    const resetMs = primary.resetAt ? Date.parse(primary.resetAt) : Number.NaN;
    const startMs = Number.isFinite(resetMs) ? resetMs - duration : Date.now() - duration;
    try {
      const summaries = await fetchModelSummaries(auth.key, startMs, Date.now());
      const entry = report.entries[0];
      if (entry)
        entry.product_usage = modelSegments(summaries, entry.used_percent ?? 0);
    } catch {
      // model split is optional
    }
  }
  return report;
}

export async function buildReport(): Promise<UsageReport> {
  const cached = loadCache();
  try {
    const report = await fetchLive();
    saveCache(report);
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not fetch Z.ai usage";
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
  for (const product of entry.product_usage)
    console.log(`  · ${product.label} ${Math.round(product.percent)}%`);
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
