// Z.ai (GLM Coding Plan) specific constants.

export const VENDOR_ID = "zai";
export const DEFAULT_PLAN = "Z.ai Coding Plan";
export const DISPLAY_NAME = "Z.ai Coding Plan";
export const DEFAULT_BINARY = "zai-usage-kde-widget";

export const QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
export const MODEL_USAGE_URL = "https://api.z.ai/api/monitor/usage/model-usage";
export const SUBSCRIPTION_URL = "https://z.ai/manage-apikey/subscription";

// The monitor API interprets startTime/endTime as Beijing time (UTC+8).
export const API_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const USER_AGENT = "zai-usage-kde-widget/1.3";

export const CACHE_DIR_NAME = "zai-usage-kde-widget";

export const AUTH_PROVIDER = "zai-coding-plan";

// quota/limit `unit` values: 3 = 5-hour window, 6 = weekly window.
export const UNIT_5H = 3;
export const UNIT_WEEKLY = 6;

export const MODEL_COLORS: Record<string, string> = {
  "glm-5.3": "#4C8DFF",
  "glm-5.3-air": "#7EB0FF",
  "glm-5.3-flash": "#34D399",
  "glm-5.3-airx": "#A78BFA",
  "glm-4.7": "#2563EB",
  "glm-4.6": "#F59E0B",
  "glm-4.6v": "#FB7185",
  "glm-4.5-air": "#FBBF24",
};

export const MODEL_FALLBACK_COLORS = [
  "#38BDF8",
  "#F472B6",
  "#94A3B8",
  "#C084FC",
] as const;

export const OTHER_MODEL_COLOR = "#94A3B8";

export function modelLabel(model: string): string {
  const parts = String(model).split("-").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (/^glm$/i.test(part))
      out.push("GLM");
    else if (/^\d/.test(part))
      out.push(part);
    else
      out.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  }
  return out.join(" ") || String(model);
}

export function modelColor(model: string, index = 0): string {
  const key = String(model).toLowerCase();
  const exact = MODEL_COLORS[key];
  if (exact)
    return exact;
  // Longest-prefix match covers variants like glm-5.3-preview.
  let best = "";
  for (const name of Object.keys(MODEL_COLORS)) {
    if (key.startsWith(name) && name.length > best.length)
      best = name;
  }
  const prefixed = MODEL_COLORS[best];
  if (prefixed)
    return prefixed;
  return MODEL_FALLBACK_COLORS[index % MODEL_FALLBACK_COLORS.length]!;
}
