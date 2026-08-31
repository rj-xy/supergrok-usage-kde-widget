// SuperGrok-specific constants and product helpers.

export const VENDOR_ID = "supergrok";
export const DEFAULT_PLAN = "SuperGrok";
export const DISPLAY_NAME = "Weekly SuperGrok Limit";
export const DEFAULT_BINARY = "supergrok-usage-kde-widget";

export const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const SETTINGS_URL = "https://cli-chat-proxy.grok.com/v1/settings";

export const CLIENT_TYPE = "supergrok-usage-kde-widget";
export const CLIENT_VERSION = "1.2.0";
export const USER_AGENT = "supergrok-usage-kde-widget/1.2";

export const CACHE_DIR_NAME = "supergrok-usage-kde-widget";

export const TOKEN_SKEW_SECONDS = 60;
export const REFRESH_TIMEOUT_MS = 12_000;

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

export function productColor(product: string): string {
  return PRODUCT_COLORS[product] ?? "#4C8DFF";
}

export function productLabel(product: string): string {
  return PRODUCT_LABELS[product] ?? (product.replace("Grok", "").trim() || product);
}

export function productSortKey(product: string): [number, string] {
  const idx = (PRODUCT_ORDER as readonly string[]).indexOf(product);
  return [idx === -1 ? PRODUCT_ORDER.length : idx, product];
}
