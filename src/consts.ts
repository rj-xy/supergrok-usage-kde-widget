// Generic constants shared by every usage widget (Grok, Z.ai, …).

export const DEFAULT_TIMEOUT_SECS = 30;
export const MIN_TIMEOUT_SECS = 10;
export const MAX_TIMEOUT_SECS = 120;
export const TIMEOUT_KILL_GRACE_SECS = 5;
export const EXIT_TIMED_OUT = 124;
export const EXIT_KILLED = 137;

export const FETCH_TIMEOUT_MS = 15_000;
export const SAFE_TEXT_DEFAULT_MAX = 400;

export const SEVERITY_CRITICAL_AT = 90;
export const SEVERITY_HIGH_AT = 75;
export const SEVERITY_MID_AT = 50;

export const SEVERITY_COLORS: Record<string, string> = {
  low: "#4C8DFF",
  mid: "#E8A33D",
  high: "#E85D3D",
  critical: "#D1293C",
};

export const DEFAULT_PRODUCT_COLOR = "#4C8DFF";

export const CACHE_FILE_NAME = "last.json";

export const FALLBACK_VENDOR_ID = "usage";
export const DEFAULT_DISPLAY_NAME = "Usage Limit";
export const DEFAULT_PLAN = "Plan";
export const DEFAULT_BINARY = "usage-kde-widget";

export const MONTHS = [
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
] as const;
