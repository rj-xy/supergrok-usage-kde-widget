import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

function listTar(archive: string): string[] {
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

test("pack-plasmoid writes a supergrok kpackage with metadata.json at the root", () => {
  const dir = mkdtempSync(join(tmpdir(), "pack-plasmoid-"));
  const out = join(dir, "widget.tar.gz");
  try {
    execFileSync("bash", ["scripts/pack-plasmoid.sh", "--only=supergrok", `--out=${out}`], {
      cwd: root,
      stdio: "pipe",
    });
    const names = listTar(out);
    assert.ok(names.includes("metadata.json"), names.join("\n"));
    assert.ok(names.includes("contents/ui/main.qml"), names.join("\n"));
    assert.ok(names.includes("contents/code/supergrok-usage-kde-widget"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/grok/cli.js"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/grok/fetcher.js"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/logic.js"), names.join("\n"));
    assert.equal(names.some((n) => n === "package-grok/metadata.json" || n.endsWith("/package-grok/metadata.json")), false);
    assert.equal(names.some((n) => n.startsWith("supergrok-usage-kde-widget-")), false);
    assert.equal(names.includes("contents/code/cli/zai/cli.js"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pack-plasmoid writes a zai kpackage with metadata.json at the root", () => {
  const dir = mkdtempSync(join(tmpdir(), "pack-plasmoid-"));
  const out = join(dir, "zai.tar.gz");
  try {
    execFileSync("bash", ["scripts/pack-plasmoid.sh", "--only=zai", `--out=${out}`], {
      cwd: root,
      stdio: "pipe",
    });
    const names = listTar(out);
    assert.ok(names.includes("metadata.json"), names.join("\n"));
    assert.ok(names.includes("contents/ui/main.qml"), names.join("\n"));
    assert.ok(names.includes("contents/ui/SegmentedBar.qml"), names.join("\n"));
    assert.ok(names.includes("contents/ui/UsageBar.qml"), names.join("\n"));
    assert.ok(names.includes("contents/code/zai-usage-kde-widget"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/zai/cli.js"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/zai/fetcher.js"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/logic.js"), names.join("\n"));
    assert.equal(names.some((n) => n === "package-zai/metadata.json" || n.endsWith("/package-zai/metadata.json")), false);
    assert.equal(names.some((n) => n.startsWith("zai-usage-kde-widget-")), false);
    assert.equal(names.includes("contents/code/cli/grok/cli.js"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pack-plasmoid --out without --only is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "pack-plasmoid-"));
  try {
    assert.throws(() => {
      execFileSync("bash", ["scripts/pack-plasmoid.sh", `--out=${join(dir, "x.tar.gz")}`], {
        cwd: root,
        stdio: "pipe",
      });
    }, /--only/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
