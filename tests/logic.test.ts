import assert from "node:assert/strict"
import test from "node:test"

import {
    buildCommand,
    fileUrlToPath,
    formatResetAbsolute,
    parseReport,
    resolveBinary,
    severityColor,
    severityOf,
} from "../dist/logic.js"

const sample = {
  primary: "supergrok",
  entries: [{
    id: "supergrok",
    display_name: "Weekly SuperGrok Limit",
    plan: "SuperGrok",
    status: "ready",
    used_percent: 14,
    reset_at: "2026-08-24T00:29:53.182021+00:00",
    reset_label: "August 24, 2026 at 10:29 AM",
    product_usage: [
      { product: "GrokBuild", label: "Grok Build", percent: 9 },
      { product: "GrokChat", label: "Chat", percent: 3 },
      { product: "GrokImagine", label: "Imagine", percent: 2 },
    ],
  }],
};

test("parseReport reads the weekly pool and product split", () => {
  const parsed = parseReport(JSON.stringify(sample));
  assert.equal(parsed.ok, true);
  if (!parsed.ok)
    return;
  assert.equal(parsed.entry.usedPercent, 14);
  assert.equal(parsed.entry.products.length, 3);
  assert.equal(parsed.entry.products[0]?.label, "Grok Build");
  assert.equal(parsed.entry.products[0]?.color, "#4C8DFF");
  assert.equal(parsed.entry.resetLabel, "August 24, 2026 at 10:29 AM");
});

test("parseReport passes product colors through", () => {
  const report = {
    primary: "supergrok",
    entries: [{
      id: "supergrok",
      display_name: "Weekly SuperGrok Limit",
      status: "ready",
      used_percent: 10,
      product_usage: [{ product: "GrokChat", label: "Chat", percent: 4, color: "#2F6FE0" }],
    }],
  };
  const parsed = parseReport(JSON.stringify(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok)
    return;
  assert.equal(parsed.entry.products[0]?.color, "#2F6FE0");
});

test("parseReport rejects empty and invalid input", () => {
  assert.equal(parseReport("").ok, false);
  assert.equal(parseReport("not-json").ok, false);
});

test("fileUrlToPath strips the file:// prefix", () => {
  assert.equal(fileUrlToPath("file:///home/rj/helper"), "/home/rj/helper");
  assert.equal(fileUrlToPath("file:///opt/my%20bin/helper"), "/opt/my bin/helper");
  assert.equal(fileUrlToPath("/already/a/path"), "/already/a/path");
});

test("resolveBinary prefers a configured path, then the bundled helper", () => {
    assert.equal(resolveBinary("/opt/custom", "/bundled", "fallback-bin"), "/opt/custom");
    assert.equal(resolveBinary("  ", "/bundled", "fallback-bin"), "/bundled");
    assert.equal(resolveBinary("", "", "fallback-bin"), "fallback-bin");
    assert.equal(resolveBinary("", "", ""), "");
});

test("buildCommand quotes the binary for KShell", () => {
    assert.match(buildCommand("", 30, "my-bin"), /timeout/);
    assert.match(buildCommand("", 30, "my-bin"), /my-bin/);
    const quoted = buildCommand("/opt/my bin/supergrok-usage-kde-widget", 30, "unused");
    assert.match(quoted, /'\/opt\/my bin\/supergrok-usage-kde-widget'/);
});

test("severity bands", () => {
  assert.equal(severityOf(14), "low");
  assert.equal(severityOf(92), "critical");
});

test("formatResetAbsolute includes the year", () => {
    assert.match(formatResetAbsolute("2026-08-24T00:29:53+00:00"), /2026/);
});

test("parseReport normalizes metrics and severityColor maps bands", () => {
    const report = {
        primary: "zai",
        entries: [{
            id: "zai",
            display_name: "Z.ai Coding Plan",
            plan: "Z.ai Coding Plan",
            status: "ready",
            used_percent: 3,
            metrics: [
                { id: "5h", label: "5-hour window", percent: 3, reset_at: "2026-08-31T06:16:00Z", severity: "low", value: "153 / 12,000 credits" },
                { id: "bad", percent: "nonsense" },
            ],
        }],
    };
    const parsed = parseReport(JSON.stringify(report));
    assert.equal(parsed.ok, true);
    if (!parsed.ok)
        return;
    assert.equal(parsed.entry.id, "zai");
    assert.equal(parsed.entry.metrics.length, 1);
    assert.equal(parsed.entry.metrics[0]?.id, "5h");
    assert.equal(parsed.entry.metrics[0]?.value, "153 / 12,000 credits");
    assert.equal(parsed.entry.metrics[0]?.severity, "low");
    assert.equal(severityColor("critical"), "#D1293C");
    assert.equal(severityColor("mid"), "#E8A33D");
    assert.equal(severityColor("unknown-band"), "#4C8DFF");
});
