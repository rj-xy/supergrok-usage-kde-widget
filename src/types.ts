export type Severity = "low" | "mid" | "high" | "critical";

export type ProductUsage = {
  product: string;
  label: string;
  percent: number;
};

export type MetricSection = {
  type: "metric";
  label: string;
  value: string;
  percent: number;
  reset_at: string | null;
  severity: Severity;
};

export type UsageMetric = {
  id: string;
  label: string;
  percent: number;
  reset_at: string | null;
  severity: Severity;
};

export type UsageEntry = {
  id: string;
  name: string;
  display_name: string;
  plan: string;
  status: "ready" | "error";
  stale: boolean;
  error: string;
  fetched_at: string;
  used_percent: number | null;
  reset_at: string | null;
  reset_label: string;
  product_usage: ProductUsage[];
  metrics: UsageMetric[];
  sections: MetricSection[];
};

export type UsageReport = {
  primary: "supergrok";
  entries: [UsageEntry];
};

export type AuthEntry = {
  key: string;
  auth_mode?: string;
  expires_at?: string;
  email?: string;
};

export type ProductView = {
  product: string;
  label: string;
  percent: number;
  color: string;
};

export type ParsedEntry = {
  id: "supergrok";
  label: string;
  plan: string;
  status: string;
  stale: boolean;
  error: string;
  fetchedAt: string;
  usedPercent: number | null;
  resetAt: string;
  resetLabel: string;
  products: ProductView[];
};

export type ParseResult =
  | { ok: true; raw: string; entry: ParsedEntry }
  | { ok: false; raw: string; entry: null };

export type JsonObject = Record<string, unknown>;
