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
} from "../dist/grok/fetcher.js";
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
  assert.deepEqual(entry.product_usage.map((p) => p.color), ["#4C8DFF", "#2F6FE0", "#7EB0FF"]);
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

test("loadAuth prefers the OIDC entry from `grok login`", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({
    "https://accounts.x.ai/sign-in": { key: "legacy-token", auth_mode: "session" },
    "https://auth.x.ai::abc": { key: "oidc-token", auth_mode: "oidc", email: "dev@example.com" },
  }));
  const previous = process.env.GROK_HOME;
  const previousAuthFile = process.env.GROK_AUTH_FILE;
  const previousApiKey = process.env.GROK_API_KEY;
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "no-opencode-auth.json");
  delete process.env.GROK_API_KEY;
  try {
    assert.equal(loadAuth().key, "oidc-token");
  } finally {
    process.env.GROK_HOME = previous;
    if (previousAuthFile === undefined)
      delete process.env.GROK_AUTH_FILE;
    else
      process.env.GROK_AUTH_FILE = previousAuthFile;
    if (previousApiKey === undefined)
      delete process.env.GROK_API_KEY;
    else
      process.env.GROK_API_KEY = previousApiKey;
  }
});

test("loadAuth prefers the `grok login` token over opencode", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "opencode-auth.json"), JSON.stringify({
    anthropic: { key: "sk-ant" },
    supergrok: { key: "oc-supergrok-key", type: "api" },
  }));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({
    "https://auth.x.ai::abc": { key: "cli-oidc-token", auth_mode: "oidc" },
  }));
  const previous = { GROK_HOME: process.env.GROK_HOME, GROK_AUTH_FILE: process.env.GROK_AUTH_FILE };
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "opencode-auth.json");
  try {
    assert.equal(loadAuth().key, "cli-oidc-token");
  } finally {
    process.env.GROK_HOME = previous.GROK_HOME;
    if (previous.GROK_AUTH_FILE === undefined)
      delete process.env.GROK_AUTH_FILE;
    else
      process.env.GROK_AUTH_FILE = previous.GROK_AUTH_FILE;
  }
});

test("an expired `grok login` token still wins over opencode (it self-refreshes)", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "opencode-auth.json"), JSON.stringify({
    xai: { type: "oauth", refresh: "r", access: "fresh-access", expires: Date.now() + 3600_000 },
  }));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({
    "https://auth.x.ai::abc": { key: "expiring-cli-token", auth_mode: "oidc", expires_at: new Date(Date.now() + 60_000).toISOString() },
  }));
  const previous = { GROK_HOME: process.env.GROK_HOME, GROK_AUTH_FILE: process.env.GROK_AUTH_FILE };
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "opencode-auth.json");
  try {
    assert.equal(loadAuth().key, "expiring-cli-token");
  } finally {
    process.env.GROK_HOME = previous.GROK_HOME;
    if (previous.GROK_AUTH_FILE === undefined)
      delete process.env.GROK_AUTH_FILE;
    else
      process.env.GROK_AUTH_FILE = previous.GROK_AUTH_FILE;
  }
});

test("loadAuth falls back to opencode when there is no `grok login`", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "opencode-auth.json"), JSON.stringify({
    anthropic: { key: "sk-ant" },
    "zai-coding-plan": { key: "zai-key" },
    supergrok: { key: "oc-supergrok-key", type: "api" },
  }));
  const previous = { GROK_HOME: process.env.GROK_HOME, GROK_AUTH_FILE: process.env.GROK_AUTH_FILE };
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "opencode-auth.json");
  try {
    assert.equal(loadAuth().key, "oc-supergrok-key");
  } finally {
    process.env.GROK_HOME = previous.GROK_HOME;
    if (previous.GROK_AUTH_FILE === undefined)
      delete process.env.GROK_AUTH_FILE;
    else
      process.env.GROK_AUTH_FILE = previous.GROK_AUTH_FILE;
  }
});

test("an expired opencode token is rejected when no `grok login` exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  writeFileSync(join(dir, "opencode-auth.json"), JSON.stringify({
    xai: { type: "oauth", refresh: "r", access: "stale-access", expires: Date.now() - 60_000 },
  }));
  const previous = { GROK_HOME: process.env.GROK_HOME, GROK_AUTH_FILE: process.env.GROK_AUTH_FILE };
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "opencode-auth.json");
  try {
    assert.throws(() => loadAuth(), /grok login|opencode/);
  } finally {
    process.env.GROK_HOME = previous.GROK_HOME;
    if (previous.GROK_AUTH_FILE === undefined)
      delete process.env.GROK_AUTH_FILE;
    else
      process.env.GROK_AUTH_FILE = previous.GROK_AUTH_FILE;
  }
});

test("GROK_API_KEY overrides every auth file", () => {
  const dir = mkdtempSync(join(tmpdir(), "supergrok-auth-"));
  const previous = {
    GROK_HOME: process.env.GROK_HOME,
    GROK_AUTH_FILE: process.env.GROK_AUTH_FILE,
    GROK_API_KEY: process.env.GROK_API_KEY,
  };
  process.env.GROK_HOME = dir;
  process.env.GROK_AUTH_FILE = join(dir, "no-opencode-auth.json");
  process.env.GROK_API_KEY = "explicit-grok-key";
  try {
    assert.equal(loadAuth().key, "explicit-grok-key");
  } finally {
    process.env.GROK_HOME = previous.GROK_HOME;
    for (const key of ["GROK_AUTH_FILE", "GROK_API_KEY"] as const) {
      if (previous[key] === undefined)
        delete process.env[key];
      else
        process.env[key] = previous[key];
    }
  }
});
