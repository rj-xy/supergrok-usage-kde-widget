// Meta AI (Muse coding subscription) specific constants.

export const VENDOR_ID = "meta";
export const DEFAULT_PLAN = "Muse Coding Plan";
export const DISPLAY_NAME = "Muse Coding Plan";
export const DEFAULT_BINARY = "meta-usage-kde-widget";

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const RESPONSES_PATH = "/responses";
export const MODELS_PATH = "/muse-code/models";
export const DEFAULT_MODEL = "muse-spark-1.3";

// No stable subscription/usage page is known, so the widget opens Meta AI home.
export const SUBSCRIPTION_URL = "https://www.meta.ai/";

// Minimal prompt for the metered usage call; the reply itself is discarded.
export const USAGE_PROBE_INPUT = "Reply with exactly: ok";
// Server floor: max_output_tokens below 16 is rejected with HTTP 400.
export const USAGE_PROBE_MAX_TOKENS = 16;

export const USER_AGENT = "meta-usage-kde-widget/1.3";

export const CACHE_DIR_NAME = "meta-usage-kde-widget";

export const AUTH_PROVIDER = "meta";
