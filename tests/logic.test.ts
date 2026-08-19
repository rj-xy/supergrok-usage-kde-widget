import assert from "node:assert/strict"
import test from "node:test"

import {
    buildCommand,
    fileUrlToPath,
    formatResetAbsolute,
    parseReport,
    resolveBinary,
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
  assert.equal(resolveBinary("/opt/custom", "/bundled"), "/opt/custom");
  assert.equal(resolveBinary("  ", "/bundled"), "/bundled");
  assert.equal(resolveBinary("", ""), "supergrok-usage-kde-widget");
});

test("buildCommand quotes the binary for KShell", () => {
  assert.match(buildCommand("", 30), /timeout/);
  assert.match(buildCommand("", 30), /supergrok-usage-kde-widget/);
  const quoted = buildCommand("/opt/my bin/supergrok-usage-kde-widget", 30);
  assert.match(quoted, /'\/opt\/my bin\/supergrok-usage-kde-widget'/);
});

test("severity bands", () => {
  assert.equal(severityOf(14), "low");
  assert.equal(severityOf(92), "critical");
});

test("formatResetAbsolute includes the year", () => {
  assert.match(formatResetAbsolute("2026-08-24T00:29:53+00:00"), /2026/);
});
