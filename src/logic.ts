// Presentation helpers for the SuperGrok Plasma widget.
// Keep the emitted JS V4-safe: no optional-catch binding, no Unicode property
// escapes, no Node imports. `npm run build` writes package/contents/code/logic.js
// as a QML `.pragma library` (Plasma cannot import TypeScript).

import {
  DEFAULT_BINARY,
  DEFAULT_PLAN,
  DEFAULT_PRODUCT_COLOR,
  DEFAULT_TIMEOUT_SECS,
  DISPLAY_NAME,
  MAX_TIMEOUT_SECS,
  MIN_TIMEOUT_SECS,
  MONTHS,
  PRODUCT_COLORS,
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  SAFE_TEXT_DEFAULT_MAX,
  SEVERITY_CRITICAL_AT,
  SEVERITY_HIGH_AT,
  SEVERITY_MID_AT,
  TIMEOUT_KILL_GRACE_SECS,
  VENDOR_ID,
} from "./consts.js";
import type { ParsedEntry, ParseResult, ProductView, Severity } from "./types.js";

export {
  DEFAULT_BINARY,
  DEFAULT_TIMEOUT_SECS,
  EXIT_KILLED,
  EXIT_TIMED_OUT,
  MAX_TIMEOUT_SECS,
  MIN_TIMEOUT_SECS,
  PRODUCT_COLORS,
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  TIMEOUT_KILL_GRACE_SECS,
} from "./consts.js";

export function shellQuote(value: unknown): string {
  return "'" + String(value ?? "").replace(/'/g, "'\\''") + "'";
}

export function timeoutSeconds(value: unknown): number {
  if (value === null || value === undefined || String(value).trim() === "")
    return DEFAULT_TIMEOUT_SECS;
  const seconds = Number(value);
  if (!Number.isFinite(seconds))
    return DEFAULT_TIMEOUT_SECS;
  return Math.max(MIN_TIMEOUT_SECS, Math.min(MAX_TIMEOUT_SECS, Math.round(seconds)));
}

export function buildCommand(binary: unknown, timeoutSecs: unknown): string {
  const bin = String(binary ?? "").trim() || DEFAULT_BINARY;
  return ["timeout", "-k", String(TIMEOUT_KILL_GRACE_SECS), String(timeoutSeconds(timeoutSecs)),
    bin, "usage", "--json"].map(shellQuote).join(" ");
}

export function safeText(value: unknown, maxLength?: number): string {
  const limit = maxLength ?? SAFE_TEXT_DEFAULT_MAX;
  const s = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›");
  return s.length > limit ? s.slice(0, limit) : s;
}

export function finitePercent(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function severityOf(percent: unknown): Severity {
  const p = finitePercent(percent);
  if (p === null)
    return "low";
  return p >= SEVERITY_CRITICAL_AT ? "critical"
    : p >= SEVERITY_HIGH_AT ? "high"
      : p >= SEVERITY_MID_AT ? "mid"
        : "low";
}

export function productColor(product: string): string {
  return PRODUCT_COLORS[product] ?? DEFAULT_PRODUCT_COLOR;
}

export function productLabel(product: string): string {
  return PRODUCT_LABELS[product] ?? (product.replace("Grok", "").trim() || product);
}

export function productSortKey(product: string): [number, string] {
  const idx = (PRODUCT_ORDER as readonly string[]).indexOf(product);
  return [idx === -1 ? PRODUCT_ORDER.length : idx, product];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function normalizeProduct(raw: unknown): ProductView | null {
  if (!isRecord(raw))
    return null;
  const percent = finitePercent(raw.percent);
  if (percent === null)
    return null;
  const product = safeText(raw.product, 40);
  const label = safeText(raw.label, 40) || product;
  if (!label)
    return null;
  return {
    product: product,
    label: label,
    percent: percent,
    color: productColor(product),
  };
}

function normalizeEntry(raw: unknown): ParsedEntry {
  const rec = isRecord(raw) ? raw : {};
  const used = finitePercent(rec.used_percent);
  const products = Array.isArray(rec.product_usage)
    ? rec.product_usage.map(normalizeProduct).filter((item): item is ProductView => item !== null)
    : [];
  return {
    id: VENDOR_ID,
    label: safeText(rec.display_name, 80) || DISPLAY_NAME,
    plan: safeText(rec.plan, 80) || DEFAULT_PLAN,
    status: safeText(rec.status, 24) || "ready",
    stale: rec.stale === true,
    error: safeText(rec.error, 500),
    fetchedAt: safeText(rec.fetched_at, 64),
    usedPercent: used,
    resetAt: safeText(rec.reset_at, 64),
    resetLabel: safeText(rec.reset_label, 80),
    products: products,
  };
}

export function parseReport(stdout: unknown): ParseResult {
  const raw = String(stdout ?? "").trim();
  if (!raw)
    return { ok: false, raw: "", entry: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, raw: raw, entry: null };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.entries) || parsed.entries.length === 0)
    return { ok: false, raw: raw, entry: null };
  return { ok: true, raw: raw, entry: normalizeEntry(parsed.entries[0]) };
}

export function formatDuration(milliseconds: unknown): string {
  const ms = Number(milliseconds);
  if (!(ms > 0))
    return "now";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return days + "d " + (hours % 24) + "h";
  if (hours > 0)
    return hours + "h " + (minutes % 60) + "m";
  return Math.max(1, minutes) + "m";
}

export function resetRemainingMs(resetAt: unknown, nowMs: unknown): number | null {
  if (!resetAt)
    return null;
  const at = Date.parse(String(resetAt));
  if (!Number.isFinite(at))
    return null;
  return at - Number(nowMs);
}

export function formatResetAbsolute(resetAt: unknown): string {
  if (!resetAt)
    return "";
  const at = Date.parse(String(resetAt));
  if (!Number.isFinite(at))
    return String(resetAt);
  const dt = new Date(at);
  let hours = dt.getHours();
  const minutes = dt.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0)
    hours = 12;
  const mm = minutes < 10 ? "0" + minutes : String(minutes);
  const month = MONTHS[dt.getMonth()] ?? "";
  return month + " " + dt.getDate() + ", " + dt.getFullYear()
    + " at " + hours + ":" + mm + " " + ampm;
}
