import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  errorReport,
  loadAuth,
  reportFromBilling,
  tokenExpired,
} from "../dist/fetcher.js";
import { formatResetAbsolute } from "../dist/logic.js";

const SAMPLE = {
  config: {
    currentPeriod: {
      type: "USAGE_PERIOD_TYPE_WEEKLY",
      start: "2026-08-17T00:29:53.182021+00:00",
      end: "2026-08-24T00:29:53.182021+00:00",
    },
    creditUsagePercent: 14.0,
    productUsage: [
      { product: "GrokImagine", usagePercent: 2.0 },
      { product: "GrokBuild", usagePercent: 9.0 },
      { product: "GrokChat", usagePercent: 3.0 },
    ],
    prepaidBalance: { val: 0 },
  },
};

test("reportFromBilling orders products and keeps the weekly percent", () => {
  const report = reportFromBilling(SAMPLE, "SuperGrok");
  const entry = report.entries[0];
  assert.equal(entry.used_percent, 14);
  assert.equal(entry.plan, "SuperGrok");
  assert.deepEqual(entry.product_usage.map((p) => p.label), ["Grok Build", "Chat", "Imagine"]);
  assert.deepEqual(entry.product_usage.map((p) => p.percent), [9, 3, 2]);
  assert.equal(entry.reset_at, "2026-08-24T00:29:53.182021+00:00");
  assert.equal(entry.sections[0]?.percent, 14);
  assert.equal(entry.status, "ready");
});

test("missing percent after rollover is zero", () => {
  const entry = reportFromBilling(
    { config: { currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY" } } },
    "SuperGrok Heavy",
  ).entries[0];
  assert.equal(entry.used_percent, 0);
  assert.equal(entry.plan, "SuperGrok Heavy");
  assert.deepEqual(entry.product_usage, []);
});

test("errorReport keeps cached usage as stale", () => {
  const good = reportFromBilling(SAMPLE, "SuperGrok");
  const stale = errorReport("Grok login expired; run `grok login`", good);
  const entry = stale.entries[0];
  assert.equal(entry.stale, true);
  assert.equal(entry.used_percent, 14);
  assert.match(entry.error, /login expired/);
});

test("tokenExpired treats missing expiry as fresh", () => {
  const now = Date.now();
  assert.equal(tokenExpired({ expires_at: new Date(now - 60_000).toISOString() }), true);
  assert.equal(tokenExpired({ expires_at: new Date(now + 2 * 3600_000).toISOString() }), false);
  assert.equal(tokenExpired({}), false);
});

test("formatResetAbsolute wording", () => {
  const label = formatResetAbsolute("2026-08-24T00:29:53+00:00");
  assert.match(label, /August 24, 2026 at/);
  assert.match(label, /AM|PM/);
  assert.equal(formatResetAbsolute(null), "");
});

test("loadAuth prefers the OIDC entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({
    "https://accounts.x.ai/sign-in": { key: "legacy-token", auth_mode: "session" },
    "https://auth.x.ai::abc": { key: "oidc-token", auth_mode: "oidc", email: "dev@example.com" },
  }));
  const previous = process.env.GROK_HOME;
  process.env.GROK_HOME = dir;
  try {
    assert.equal(loadAuth().key, "oidc-token");
  } finally {
    if (previous === undefined)
      delete process.env.GROK_HOME;
    else
      process.env.GROK_HOME = previous;
  }
});
