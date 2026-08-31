.pragma library
// Generated from src/consts.ts and src/logic.ts by `yarn run build`. Do not edit.
// Generic constants shared by every usage widget (Grok, Z.ai, …).
const DEFAULT_TIMEOUT_SECS = 30;
const MIN_TIMEOUT_SECS = 10;
const MAX_TIMEOUT_SECS = 120;
const TIMEOUT_KILL_GRACE_SECS = 5;
const EXIT_TIMED_OUT = 124;
const EXIT_KILLED = 137;
const FETCH_TIMEOUT_MS = 15_000;
const SAFE_TEXT_DEFAULT_MAX = 400;
const SEVERITY_CRITICAL_AT = 90;
const SEVERITY_HIGH_AT = 75;
const SEVERITY_MID_AT = 50;
const SEVERITY_COLORS = {
    low: "#4C8DFF",
    mid: "#E8A33D",
    high: "#E85D3D",
    critical: "#D1293C",
};
const DEFAULT_PRODUCT_COLOR = "#4C8DFF";
const CACHE_FILE_NAME = "last.json";
const FALLBACK_VENDOR_ID = "usage";
const DEFAULT_DISPLAY_NAME = "Usage Limit";
const DEFAULT_PLAN = "Plan";
const DEFAULT_BINARY = "usage-kde-widget";
const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
// Presentation helpers shared by the usage Plasma widgets.
// Keep the emitted JS V4-safe: no optional-catch binding, no Unicode property
// escapes, no Node imports. `yarn run build` writes package*/contents/code/logic.js
// as a QML `.pragma library` (Plasma cannot import TypeScript).
function shellQuote(value) {
    return "'" + String(value ?? "").replace(/'/g, "'\\''") + "'";
}
function timeoutSeconds(value) {
    if (value === null || value === undefined || String(value).trim() === "")
        return DEFAULT_TIMEOUT_SECS;
    const seconds = Number(value);
    if (!Number.isFinite(seconds))
        return DEFAULT_TIMEOUT_SECS;
    return Math.max(MIN_TIMEOUT_SECS, Math.min(MAX_TIMEOUT_SECS, Math.round(seconds)));
}
function fileUrlToPath(url) {
    let s = String(url ?? "").trim();
    if (s.indexOf("file://") === 0) {
        s = s.slice(7);
        if (/^\/[A-Za-z]:/.test(s))
            s = s.slice(1);
        try {
            s = decodeURIComponent(s);
        }
        catch (e) {
            // keep the sliced path if the URL is malformed
        }
    }
    return s;
}
function resolveBinary(configured, bundled, fallback) {
    const custom = String(configured ?? "").trim();
    if (custom)
        return custom;
    const bundledPath = String(bundled ?? "").trim();
    if (bundledPath)
        return bundledPath;
    return String(fallback ?? "").trim();
}
function buildCommand(binary, timeoutSecs, fallback) {
    const bin = String(binary ?? "").trim() || String(fallback ?? "").trim() || DEFAULT_BINARY;
    return ["timeout", "-k", String(TIMEOUT_KILL_GRACE_SECS), String(timeoutSeconds(timeoutSecs)),
        bin, "usage", "--json"].map(shellQuote).join(" ");
}
function safeText(value, maxLength) {
    const limit = maxLength ?? SAFE_TEXT_DEFAULT_MAX;
    const s = String(value ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
        .replace(/</g, "‹")
        .replace(/>/g, "›");
    return s.length > limit ? s.slice(0, limit) : s;
}
function finitePercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}
function severityOf(percent) {
    const p = finitePercent(percent);
    if (p === null)
        return "low";
    return p >= SEVERITY_CRITICAL_AT ? "critical"
        : p >= SEVERITY_HIGH_AT ? "high"
            : p >= SEVERITY_MID_AT ? "mid"
                : "low";
}
function severityColor(severity) {
    return SEVERITY_COLORS[String(severity)] ?? DEFAULT_PRODUCT_COLOR;
}
function isRecord(value) {
    return !!value && typeof value === "object";
}
function normalizeProduct(raw) {
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
        color: safeText(raw.color, 24) || DEFAULT_PRODUCT_COLOR,
    };
}
function normalizeMetric(raw) {
    if (!isRecord(raw))
        return null;
    const percent = finitePercent(raw.percent);
    if (percent === null)
        return null;
    const id = safeText(raw.id, 40);
    const label = safeText(raw.label, 60) || id;
    if (!label)
        return null;
    const severity = String(raw.severity ?? "low");
    return {
        id: id,
        label: label,
        percent: percent,
        resetAt: safeText(raw.reset_at, 64),
        severity: (severity === "mid" || severity === "high" || severity === "critical") ? severity : "low",
        value: safeText(raw.value, 120),
    };
}
function normalizeEntry(raw) {
    const rec = isRecord(raw) ? raw : {};
    const used = finitePercent(rec.used_percent);
    const products = Array.isArray(rec.product_usage)
        ? rec.product_usage.map(normalizeProduct).filter((item) => item !== null)
        : [];
    const metrics = Array.isArray(rec.metrics)
        ? rec.metrics.map(normalizeMetric).filter((item) => item !== null)
        : [];
    return {
        id: safeText(rec.id, 40) || FALLBACK_VENDOR_ID,
        label: safeText(rec.display_name, 80) || DEFAULT_DISPLAY_NAME,
        plan: safeText(rec.plan, 80) || DEFAULT_PLAN,
        status: safeText(rec.status, 24) || "ready",
        stale: rec.stale === true,
        error: safeText(rec.error, 500),
        fetchedAt: safeText(rec.fetched_at, 64),
        usedPercent: used,
        resetAt: safeText(rec.reset_at, 64),
        resetLabel: safeText(rec.reset_label, 80),
        products: products,
        metrics: metrics,
    };
}
function parseReport(stdout) {
    const raw = String(stdout ?? "").trim();
    if (!raw)
        return { ok: false, raw: "", entry: null };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        return { ok: false, raw: raw, entry: null };
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.entries) || parsed.entries.length === 0)
        return { ok: false, raw: raw, entry: null };
    return { ok: true, raw: raw, entry: normalizeEntry(parsed.entries[0]) };
}
function formatDuration(milliseconds) {
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
function resetRemainingMs(resetAt, nowMs) {
    if (!resetAt)
        return null;
    const at = Date.parse(String(resetAt));
    if (!Number.isFinite(at))
        return null;
    return at - Number(nowMs);
}
function formatResetAbsolute(resetAt) {
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