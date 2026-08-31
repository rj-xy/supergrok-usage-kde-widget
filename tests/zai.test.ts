import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cachePath,
  collectQuotaRecords,
  errorReport,
  fetchModelSummaries,
  formatApiTime,
  loadAuth,
  loadCache,
  modelSegments,
  parseModelSummaries,
  reportFromQuota,
  saveCache,
} from "../dist/zai/fetcher.js";

const RESET_5H = Date.UTC(2026, 7, 31, 6, 16, 0);
const RESET_WEEKLY = Date.UTC(2026, 8, 7, 0, 0, 0);

const QUOTA = {
  code: 0,
  data: [
    { unit: 3, usage: 12000, currentValue: 153, remaining: 11847, percentage: 1.27, nextResetTime: RESET_5H },
    { unit: 6, usage: 60000, currentValue: 153, remaining: 59847, percentage: 0.26, nextResetTime: RESET_WEEKLY },
  ],
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    const value = vars[key];
    if (value === undefined)
      delete process.env[key];
    else
      process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined)
        delete process.env[key];
      else
        process.env[key] = value;
    }
  }
}

test("reportFromQuota maps both windows", () => {
  const entry = reportFromQuota(QUOTA).entries[0];
  assert.ok(entry);
  assert.ok(Math.abs((entry.used_percent ?? 0) - 1.275) < 1e-9);
  assert.equal(entry.metrics.length, 2);
  const five = entry.metrics[0];
  assert.equal(five?.id, "5h");
  assert.equal(five?.label, "5-hour window");
  assert.equal(five?.percent, 1);
  assert.equal(five?.reset_at, "2026-08-31T06:16:00Z");
  assert.equal(five?.value, "153 / 12,000 credits");
  assert.equal(five?.severity, "low");
  const weekly = entry.metrics[1];
  assert.equal(weekly?.id, "weekly");
  assert.equal(weekly?.label, "Weekly");
  assert.equal(weekly?.value, "153 / 60,000 credits");
  assert.equal(entry.sections.length, 2);
  assert.equal(entry.status, "ready");
  assert.deepEqual(entry.product_usage, []);
  assert.equal(entry.reset_at, "2026-08-31T06:16:00Z");
});

test("weekly-only quota uses the weekly window", () => {
  const entry = reportFromQuota({
    data: [{ unit: 6, usage: 60000, currentValue: 30000 }],
  }).entries[0];
  assert.equal(entry.used_percent, 50);
  assert.equal(entry.metrics.length, 1);
  assert.equal(entry.metrics[0]?.id, "weekly");
});

test("percentage is the fallback when credits are missing", () => {
  const entry = reportFromQuota({
    data: [{ unit: 3, percentage: 42, nextResetTime: RESET_5H }],
  }).entries[0];
  assert.equal(entry.used_percent, 42);
  assert.equal(entry.metrics[0]?.value, undefined);
});

test("reportFromQuota rejects responses without quota windows", () => {
  assert.throws(() => reportFromQuota({ data: [] }), /no 5-hour or weekly/);
  assert.throws(() => reportFromQuota(null), /no 5-hour or weekly/);
  assert.throws(() => reportFromQuota("nope"), /no 5-hour or weekly/);
});

test("collectQuotaRecords finds records in flat and wrapped shapes", () => {
  const flat = collectQuotaRecords([{ unit: 3, usage: 10, currentValue: 5 }]);
  assert.equal(flat.length, 1);
  const wrapped = collectQuotaRecords({
    result: { list: [{ unit: 6, usage: 10, currentValue: 5 }] },
  });
  assert.equal(wrapped.length, 1);
});

test("errorReport keeps cached usage as stale", () => {
  const good = reportFromQuota(QUOTA);
  const stale = errorReport("quota request failed (HTTP 500)", good);
  const entry = stale.entries[0];
  assert.equal(entry.stale, true);
  assert.ok(Math.abs((entry.used_percent ?? 0) - 1.275) < 1e-9);
  assert.match(entry.error, /HTTP 500/);
  const fresh = errorReport("no key").entries[0];
  assert.equal(fresh?.status, "error");
  assert.equal(fresh?.used_percent, null);
});

test("loadAuth prefers zai-coding-plan, then any zai provider", () => {
  const dir = mkdtempSync(join(tmpdir(), "zai-auth-"));
  try {
    const path = join(dir, "auth.json");
    writeFileSync(path, JSON.stringify({
      anthropic: { key: "sk-ant" },
      "zai-coding-plan": { key: "zai-key", type: "api" },
      "zai-other": { key: "zai-other-key" },
    }));
    withEnv({ ZAI_AUTH_FILE: path, ZAI_API_KEY: undefined }, () => {
      assert.equal(loadAuth().key, "zai-key");
    });
    writeFileSync(path, JSON.stringify({ "zai-web": { key: "zw" } }));
    withEnv({ ZAI_AUTH_FILE: path, ZAI_API_KEY: undefined }, () => {
      assert.equal(loadAuth().key, "zw");
    });
    writeFileSync(path, JSON.stringify({ anthropic: { key: "sk-ant" } }));
    withEnv({ ZAI_AUTH_FILE: path, ZAI_API_KEY: undefined }, () => {
      assert.throws(() => loadAuth(), /GLM Coding Plan/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ZAI_API_KEY overrides the auth file", () => {
  withEnv({ ZAI_API_KEY: "explicit-key", ZAI_AUTH_FILE: "/nonexistent/auth.json" }, () => {
    assert.equal(loadAuth().key, "explicit-key");
  });
});

test("zai cache roundtrips under its own directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "zai-cache-"));
  try {
    withEnv({ XDG_CACHE_HOME: dir }, () => {
      assert.match(cachePath(), /zai-usage-kde-widget/);
      const report = reportFromQuota(QUOTA);
      saveCache(report);
      assert.deepEqual(loadCache(), report);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MODEL_USAGE = {
  code: 200,
  data: {
    x_time: ["2026-08-31 09:00", "2026-08-31 10:00"],
    totalUsage: {
      totalModelCallCount: 176,
      totalTokensUsage: 12477693,
      modelSummaryList: [
        { modelName: "GLM-5.3", totalTokens: 11574163, sortOrder: 1 },
        { modelName: "GLM-5.3-Flash", totalTokens: 903530, sortOrder: 2 },
      ],
    },
    modelDataList: [
      { modelName: "GLM-5.3", sortOrder: 1, tokensUsage: [0, 11574163], totalTokens: 11574163 },
      { modelName: "GLM-5.3-Flash", sortOrder: 2, tokensUsage: [0, 903530], totalTokens: 903530 },
    ],
  },
};

test("parseModelSummaries dedupes the summary and per-model lists", () => {
  const summaries = parseModelSummaries(MODEL_USAGE);
  assert.deepEqual(
    summaries.map((s) => s.model).sort(),
    ["GLM-5.3", "GLM-5.3-Flash"],
  );
  assert.equal(summaries.reduce((sum, s) => sum + s.tokens, 0), 12477693);
  assert.deepEqual(parseModelSummaries({ data: {} }), []);
});

test("modelSegments splits the used percent by token share", () => {
  const summaries = parseModelSummaries(MODEL_USAGE);
  const segments = modelSegments(summaries, 10);
  assert.equal(segments.length, 2);
  const glm = segments[0];
  const flash = segments[1];
  assert.equal(glm?.label, "GLM 5.3");
  assert.equal(glm?.color, "#4C8DFF");
  assert.equal(flash?.label, "GLM 5.3 Flash");
  assert.equal(flash?.color, "#34D399");
  const sum = (glm?.percent ?? 0) + (flash?.percent ?? 0);
  assert.ok(Math.abs(sum - 10) < 1e-9, `sum ${sum}`);
  assert.ok((glm?.percent ?? 0) > (flash?.percent ?? 0));
  assert.deepEqual(modelSegments(summaries, 0), []);
  assert.deepEqual(modelSegments([], 10), []);
});

test("modelSegments lumps long tails into Other", () => {
  const summaries = [
    { model: "GLM-5.3", tokens: 100 },
    { model: "GLM-5.3-Flash", tokens: 50 },
    { model: "glm-4.6", tokens: 20 },
    { model: "glm-4.6v", tokens: 10 },
    { model: "mystery-model", tokens: 5 },
  ];
  const segments = modelSegments(summaries, 50, 4);
  assert.equal(segments.length, 4);
  assert.equal(segments[3]?.label, "Other");
  assert.equal(segments[3]?.color, "#94A3B8");
  const sum = segments.reduce((acc, s) => acc + s.percent, 0);
  assert.ok(Math.abs(sum - 50) < 1e-9);
});

test("formatApiTime renders Beijing-time wall clock", () => {
  // 2026-08-31T00:00:00Z is 08:00 in UTC+8.
  assert.equal(formatApiTime(Date.UTC(2026, 7, 31, 0, 0, 0)), "2026-08-31 08:00:00");
  // 2026-08-31T16:30:05Z is 2026-09-01 00:30:05 in UTC+8.
  assert.equal(formatApiTime(Date.UTC(2026, 7, 31, 16, 30, 5)), "2026-09-01 00:30:05");
});

test("fetchModelSummaries returns empty on http errors", async () => {
  const summaries = await fetchModelSummaries("not-a-key", Date.now() - 3600e3, Date.now());
  assert.equal(summaries.length, 0);
});
