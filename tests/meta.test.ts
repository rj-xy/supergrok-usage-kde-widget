import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cachePath,
  errorReport,
  fetchLive,
  loadAuth,
  loadCache,
  parseSubscriptionEvent,
  planFromTier,
  readMuseSlot,
  reportFromSubscription,
  resolveBaseUrl,
  saveCache,
} from "../dist/meta/fetcher.js";

// Live frame shape (2026-09-17): payload nests under `subscription`,
// resets are epoch seconds.
const LIVE_FRAME = {
  type: "response.subscription_usage",
  subscription: {
    tier: "12345678901234567",
    window: { used_percent: 0, window_duration_mins: 300, resets_at: 1789625628 },
    weekly: { used_percent: 4, resets_at: 1789948800 },
  },
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

async function withEnvAsync(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
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
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined)
        delete process.env[key];
      else
        process.env[key] = value;
    }
  }
}

test("parseSubscriptionEvent handles the live nested shape", () => {
  const usage = parseSubscriptionEvent(LIVE_FRAME);
  assert.ok(usage);
  assert.equal(usage.tier, "12345678901234567");
  assert.equal(usage.window.usedPercent, 0);
  assert.equal(usage.window.durationMins, 300);
  assert.equal(usage.window.resetsAt, "2026-09-17T06:13:48Z");
  assert.equal(usage.weekly.usedPercent, 4);
  assert.equal(usage.weekly.resetsAt, "2026-09-21T00:00:00Z");
});

test("parseSubscriptionEvent tolerates flat and camelCase shapes", () => {
  const camel = parseSubscriptionEvent({
    type: "response.subscription_usage",
    subscription: {
      tier: "Pro",
      window: { usedPercent: 12, windowDurationMins: 300, resetsAtMs: 1789625628000 },
      weekly: { usedPercent: 34, resetsAt: "2026-09-21T00:00:00Z" },
    },
  });
  assert.ok(camel);
  assert.equal(camel.tier, "Pro");
  assert.equal(camel.window.usedPercent, 12);
  assert.equal(camel.window.resetsAt, "2026-09-17T06:13:48Z");
  assert.equal(camel.weekly.usedPercent, 34);
  assert.equal(camel.weekly.resetsAt, "2026-09-21T00:00:00Z");

  const flat = parseSubscriptionEvent({
    type: "response.subscription_usage",
    used_percent: 7,
  });
  assert.ok(flat);
  assert.equal(flat.window.usedPercent, 7);
  assert.equal(flat.weekly.usedPercent, null);
});

test("parseSubscriptionEvent returns null without usage numbers", () => {
  assert.equal(parseSubscriptionEvent({ type: "response.subscription_usage" }), null);
  assert.equal(parseSubscriptionEvent({ type: "response.completed" }), null);
  assert.equal(parseSubscriptionEvent(null), null);
  assert.equal(parseSubscriptionEvent("nope"), null);
});

test("reportFromSubscription shows the weekly window only", () => {
  const usage = parseSubscriptionEvent(LIVE_FRAME);
  assert.ok(usage);
  const entry = reportFromSubscription(usage).entries[0];
  assert.ok(entry);
  assert.equal(entry.used_percent, 4);
  assert.equal(entry.reset_at, "2026-09-21T00:00:00Z");
  assert.equal(entry.metrics.length, 1);
  assert.equal(entry.metrics[0]?.id, "weekly");
  assert.equal(entry.metrics[0]?.label, "Weekly");
  assert.equal(entry.metrics[0]?.percent, 4);
  assert.equal(entry.metrics[0]?.reset_at, "2026-09-21T00:00:00Z");
  assert.equal(entry.sections.length, 1);
  assert.equal(entry.status, "ready");
  assert.deepEqual(entry.product_usage, []);
});

test("reportFromSubscription ignores the 5-hour window", () => {
  const entry = reportFromSubscription({
    tier: "",
    window: { usedPercent: 80, durationMins: 300, resetsAt: "2026-09-17T06:13:48Z" },
    weekly: { usedPercent: 4, durationMins: null, resetsAt: "2026-09-21T00:00:00Z" },
  }).entries[0];
  assert.equal(entry.used_percent, 4);
  assert.equal(entry.reset_at, "2026-09-21T00:00:00Z");
  assert.equal(entry.metrics.length, 1);
});

test("reportFromSubscription rejects payloads without a weekly window", () => {
  assert.throws(() => reportFromSubscription({
    tier: "",
    window: { usedPercent: 80, durationMins: 300, resetsAt: "2026-09-17T06:13:48Z" },
    weekly: { usedPercent: null, durationMins: null, resetsAt: null },
  }), /no weekly window/);
});

test("planFromTier only adopts human-looking tier names", () => {
  assert.equal(planFromTier("12345678901234567"), "Muse Coding Plan");
  assert.equal(planFromTier(""), "Muse Coding Plan");
  assert.equal(planFromTier("Muse Pro"), "Muse Pro");
});

test("errorReport keeps cached usage as stale", () => {
  const usage = parseSubscriptionEvent(LIVE_FRAME);
  assert.ok(usage);
  const good = reportFromSubscription(usage);
  const stale = errorReport("usage request failed (HTTP 500)", good);
  const entry = stale.entries[0];
  assert.equal(entry.stale, true);
  assert.equal(entry.used_percent, 4);
  assert.match(entry.error, /HTTP 500/);
  const fresh = errorReport("no key").entries[0];
  assert.equal(fresh?.status, "error");
  assert.equal(fresh?.used_percent, null);
});

test("loadAuth prefers api_key, then access_token, then opencode", () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-auth-"));
  try {
    const museAuth = join(dir, "muse-auth.json");
    const opencodeAuth = join(dir, "opencode-auth.json");
    writeFileSync(opencodeAuth, JSON.stringify({
      anthropic: { key: "sk-ant" },
      meta: { type: "api", key: "oc-meta-key" },
    }));
    writeFileSync(museAuth, JSON.stringify({
      providers: { meta: { api_key: "muse-key", access_token: "muse-token" } },
    }));
    withEnv({
      MUSE_AUTH_PATH: museAuth,
      META_AUTH_FILE: opencodeAuth,
      META_API_KEY: undefined,
    }, () => {
      assert.equal(loadAuth().key, "muse-key");
    });
    writeFileSync(museAuth, JSON.stringify({
      providers: { meta: { access_token: "muse-token" } },
    }));
    withEnv({
      MUSE_AUTH_PATH: museAuth,
      META_AUTH_FILE: opencodeAuth,
      META_API_KEY: undefined,
    }, () => {
      assert.equal(loadAuth().key, "muse-token");
    });
    writeFileSync(museAuth, JSON.stringify({ providers: {} }));
    withEnv({
      MUSE_AUTH_PATH: museAuth,
      META_AUTH_FILE: opencodeAuth,
      META_API_KEY: undefined,
    }, () => {
      assert.equal(loadAuth().key, "oc-meta-key");
    });
    writeFileSync(opencodeAuth, JSON.stringify({ anthropic: { key: "sk-ant" } }));
    withEnv({
      MUSE_AUTH_PATH: museAuth,
      META_AUTH_FILE: opencodeAuth,
      META_API_KEY: undefined,
    }, () => {
      assert.throws(() => loadAuth(), /muse login/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("META_API_KEY overrides every auth file", () => {
  withEnv({
    META_API_KEY: "explicit-key",
    MUSE_AUTH_PATH: "/nonexistent/muse-auth.json",
    META_AUTH_FILE: "/nonexistent/opencode-auth.json",
  }, () => {
    assert.equal(loadAuth().key, "explicit-key");
  });
});

test("readMuseSlot surfaces the auth file base URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-slot-"));
  try {
    const path = join(dir, "auth.json");
    writeFileSync(path, JSON.stringify({
      providers: {
        meta: { api_key: "k", api_base_url: "https://example.test/v1/" },
      },
    }));
    withEnv({ MUSE_AUTH_PATH: path, META_API_KEY: undefined }, () => {
      assert.equal(readMuseSlot()?.apiBaseUrl, "https://example.test/v1/");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBaseUrl prefers env, auth file, settings, default", () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-base-"));
  try {
    const authPath = join(dir, "auth.json");
    const settingsPath = join(dir, "settings.json");
    writeFileSync(authPath, JSON.stringify({
      providers: { meta: { api_key: "k", api_base_url: "https://auth.test/v1" } },
    }));
    writeFileSync(settingsPath, JSON.stringify({
      endpoint_transport: { base_url: "https://settings.test/v1" },
    }));
    const base = {
      MUSE_AUTH_PATH: authPath,
      MUSE_SETTINGS_PATH: settingsPath,
      META_API_KEY: undefined,
    };
    withEnv({ ...base, META_BASE_URL: "https://env.test/v1/" }, () => {
      assert.equal(resolveBaseUrl(), "https://env.test/v1");
    });
    withEnv({ ...base, META_BASE_URL: undefined }, () => {
      assert.equal(resolveBaseUrl(), "https://auth.test/v1");
    });
    writeFileSync(authPath, JSON.stringify({ providers: { meta: { api_key: "k" } } }));
    withEnv({ ...base, META_BASE_URL: undefined }, () => {
      assert.equal(resolveBaseUrl(), "https://settings.test/v1");
    });
    writeFileSync(settingsPath, JSON.stringify({ provider: "meta" }));
    withEnv({ ...base, META_BASE_URL: undefined }, () => {
      assert.equal(resolveBaseUrl(), "https://api.meta.ai/v1");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("meta cache roundtrips under its own directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-cache-"));
  try {
    withEnv({ XDG_CACHE_HOME: dir }, () => {
      assert.match(cachePath(), /meta-usage-kde-widget/);
      const usage = parseSubscriptionEvent(LIVE_FRAME);
      assert.ok(usage);
      const report = reportFromSubscription(usage);
      saveCache(report);
      assert.deepEqual(loadCache(), report);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

type FakeMode = "happy" | "bad-key" | "no-frame" | "bad-frame";

function startFake(types: FakeMode[]): Promise<{ url: string; close: () => void }> {
  let index = 0;
  const server = createServer((req, res) => {
    req.resume();
    const mode = types[Math.min(index, types.length - 1)] ?? "happy";
    index += 1;
    if (req.method !== "POST" || req.url !== "/responses") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: "no such route" } }));
      return;
    }
    if (req.headers.authorization !== "Bearer test-key-123") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "auth_error", message: "bad credentials" } }));
      return;
    }
    if (mode === "bad-key") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "auth_error", message: "bad credentials" } }));
      return;
    }
    const frames = mode === "no-frame"
      ? [{ type: "response.completed" }]
      : mode === "bad-frame"
        ? [{ type: "response.subscription_usage" }, { type: "response.completed" }]
        : [
            { type: "response.created" },
            LIVE_FRAME,
            { type: "response.completed" },
          ];
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const frame of frames)
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}

test("fetchLive reads the usage frame and stops the stream", async () => {
  const fake = await startFake(["happy"]);
  try {
    await withEnvAsync({
      META_API_KEY: "test-key-123",
      META_BASE_URL: fake.url,
      MUSE_AUTH_PATH: join(tmpdir(), "meta-test-no-auth.json"),
    }, async () => {
      const entry = (await fetchLive()).entries[0];
      assert.equal(entry.status, "ready");
      assert.equal(entry.used_percent, 4);
      assert.equal(entry.plan, "Muse Coding Plan");
      assert.equal(entry.metrics.length, 1);
    });
  } finally {
    fake.close();
  }
});

test("fetchLive maps auth failures to the login hint", async () => {
  const fake = await startFake(["bad-key"]);
  try {
    await withEnvAsync({
      META_API_KEY: "test-key-123",
      META_BASE_URL: fake.url,
      MUSE_AUTH_PATH: join(tmpdir(), "meta-test-no-auth.json"),
    }, async () => {
      await assert.rejects(() => fetchLive(), /muse login/);
    });
  } finally {
    fake.close();
  }
});

test("fetchLive rejects streams without a usable usage frame", async () => {
  const fake = await startFake(["no-frame", "bad-frame"]);
  try {
    await withEnvAsync({
      META_API_KEY: "test-key-123",
      META_BASE_URL: fake.url,
      MUSE_AUTH_PATH: join(tmpdir(), "meta-test-no-auth.json"),
    }, async () => {
      await assert.rejects(() => fetchLive(), /no subscription usage frame/);
      await assert.rejects(() => fetchLive(), /unparseable/);
    });
  } finally {
    fake.close();
  }
});
