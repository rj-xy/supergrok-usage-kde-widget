export const VENDOR_ID = "supergrok";
export const DEFAULT_PLAN = "SuperGrok";
export const DISPLAY_NAME = "Weekly SuperGrok Limit";
export const DEFAULT_BINARY = "supergrok-usage-kde-widget";

export const DEFAULT_TIMEOUT_SECS = 30;
export const MIN_TIMEOUT_SECS = 10;
export const MAX_TIMEOUT_SECS = 120;
export const TIMEOUT_KILL_GRACE_SECS = 5;
export const EXIT_TIMED_OUT = 124;
export const EXIT_KILLED = 137;

export const TOKEN_SKEW_SECONDS = 60;
export const FETCH_TIMEOUT_MS = 15_000;
export const REFRESH_TIMEOUT_MS = 12_000;
export const SAFE_TEXT_DEFAULT_MAX = 400;

export const SEVERITY_CRITICAL_AT = 90;
export const SEVERITY_HIGH_AT = 75;
export const SEVERITY_MID_AT = 50;

export const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const SETTINGS_URL = "https://cli-chat-proxy.grok.com/v1/settings";

export const CLIENT_TYPE = "supergrok-usage-kde-widget";
export const CLIENT_VERSION = "1.2.0";
export const USER_AGENT = "supergrok-usage-kde-widget/1.2";

export const CACHE_DIR_NAME = "supergrok-usage-kde-widget";
export const CACHE_FILE_NAME = "last.json";

export const DEFAULT_PRODUCT_COLOR = "#4C8DFF";

export const PRODUCT_COLORS: Record<string, string> = {
  GrokBuild: "#4C8DFF",
  GrokChat: "#2F6FE0",
  GrokImagine: "#7EB0FF",
  GrokVoice: "#A78BFA",
  GrokApi: "#34D399",
  GrokAPI: "#34D399",
};

export const PRODUCT_LABELS: Record<string, string> = {
  GrokBuild: "Grok Build",
  GrokChat: "Chat",
  GrokImagine: "Imagine",
  GrokVoice: "Voice",
  GrokApi: "API",
  GrokAPI: "API",
};

export const PRODUCT_ORDER = [
  "GrokBuild",
  "GrokChat",
  "GrokImagine",
  "GrokVoice",
  "GrokApi",
  "GrokAPI",
] as const;

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
