import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadOpencodeAuth, opencodeAuthPath } from "../dist/opencode.js";

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

const OPTIONS = {
  providers: ["supergrok", "xai"],
  providerPrefix: "grok",
  envKey: "TEST_API_KEY",
  envFile: "TEST_AUTH_FILE",
  missingError: "no usable key",
};

test("loadOpencodeAuth tries exact providers in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "opencode-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify({
    xai: { key: "xai-key" },
    supergrok: { key: "supergrok-key" },
  }));
  withEnv({ TEST_AUTH_FILE: path, TEST_API_KEY: undefined }, () => {
    assert.equal(loadOpencodeAuth(OPTIONS).key, "supergrok-key");
    assert.equal(
      loadOpencodeAuth({ ...OPTIONS, providers: ["xai", "supergrok"] }).key,
      "xai-key",
    );
  });
});

test("loadOpencodeAuth falls back to the provider prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "opencode-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify({
    anthropic: { key: "sk-ant" },
    "grok-coding-plan": { key: "prefix-key" },
  }));
  withEnv({ TEST_AUTH_FILE: path, TEST_API_KEY: undefined }, () => {
    assert.equal(loadOpencodeAuth(OPTIONS).key, "prefix-key");
  });
});

test("loadOpencodeAuth env key wins over the auth file", () => {
  withEnv({ TEST_API_KEY: "explicit", TEST_AUTH_FILE: "/nonexistent/auth.json" }, () => {
    assert.equal(loadOpencodeAuth(OPTIONS).key, "explicit");
  });
});

test("loadOpencodeAuth errors on missing or exhausted auth", () => {
  withEnv({ TEST_API_KEY: undefined, TEST_AUTH_FILE: "/nonexistent/auth.json" }, () => {
    assert.throws(() => loadOpencodeAuth(OPTIONS), /no usable key/);
  });
  const dir = mkdtempSync(join(tmpdir(), "opencode-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify({ anthropic: { key: "sk-ant" } }));
  withEnv({ TEST_AUTH_FILE: path, TEST_API_KEY: undefined }, () => {
    assert.throws(() => loadOpencodeAuth(OPTIONS), /no usable key/);
  });
});

test("loadOpencodeAuth reads OAuth access tokens and maps expiry", () => {
  const dir = mkdtempSync(join(tmpdir(), "opencode-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify({
    xai: { type: "oauth", refresh: "r", access: "access-jwt", expires: Date.now() + 3600_000 },
  }));
  withEnv({ TEST_AUTH_FILE: path, TEST_API_KEY: undefined }, () => {
    const auth = loadOpencodeAuth(OPTIONS);
    assert.equal(auth.key, "access-jwt");
    assert.match(auth.expires_at ?? "", /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("loadOpencodeAuth ignores entries without a usable secret", () => {
  const dir = mkdtempSync(join(tmpdir(), "opencode-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify({
    xai: { type: "oauth", refresh: "r", expires: Date.now() + 3600_000 },
    github: { type: "oauth" },
  }));
  withEnv({ TEST_AUTH_FILE: path, TEST_API_KEY: undefined }, () => {
    assert.throws(() => loadOpencodeAuth(OPTIONS), /no usable key/);
  });
});

test("opencodeAuthPath honours the env override and XDG_DATA_HOME", () => {
  withEnv({ TEST_AUTH_FILE: "/custom/auth.json", XDG_DATA_HOME: undefined }, () => {
    assert.equal(opencodeAuthPath("TEST_AUTH_FILE"), "/custom/auth.json");
    assert.match(opencodeAuthPath(), /opencode\/auth\.json$/);
  });
  withEnv({ TEST_AUTH_FILE: undefined, XDG_DATA_HOME: "/xdg-data" }, () => {
    assert.equal(opencodeAuthPath(), "/xdg-data/opencode/auth.json");
  });
});
