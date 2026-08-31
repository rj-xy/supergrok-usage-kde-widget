import type { UsageReport } from "./types.js";
import { nowRfc3339 } from "./util.js";

export type ErrorReportVendor = {
  id: string;
  displayName: string;
  defaultPlan: string;
};

export function errorReportFor(
  vendor: ErrorReportVendor,
  message: string,
  stale?: UsageReport | null,
): UsageReport {
  const cached = stale?.entries[0];
  if (cached) {
    return {
      primary: vendor.id,
      entries: [{ ...cached, stale: true, error: message, status: "ready" }],
    };
  }
  return {
    primary: vendor.id,
    entries: [{
      id: vendor.id,
      name: vendor.id,
      display_name: vendor.displayName,
      plan: vendor.defaultPlan,
      status: "error",
      stale: false,
      error: message,
      fetched_at: nowRfc3339(),
      used_percent: null,
      reset_at: null,
      reset_label: "",
      product_usage: [],
      metrics: [],
      sections: [],
    }],
  };
}
