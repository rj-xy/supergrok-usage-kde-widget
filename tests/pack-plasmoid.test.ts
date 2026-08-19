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

test("pack-plasmoid writes a kpackage with metadata.json at the root", () => {
  const dir = mkdtempSync(join(tmpdir(), "pack-plasmoid-"));
  const out = join(dir, "widget.tar.gz");
  try {
    execFileSync("bash", ["scripts/pack-plasmoid.sh", `--out=${out}`], {
      cwd: root,
      stdio: "pipe",
    });
    const names = listTar(out);
    assert.ok(names.includes("metadata.json"), names.join("\n"));
    assert.ok(names.includes("contents/ui/main.qml"), names.join("\n"));
    assert.ok(names.includes("contents/code/supergrok-usage-kde-widget"), names.join("\n"));
    assert.ok(names.includes("contents/code/cli/cli.js"), names.join("\n"));
    assert.equal(names.some((n) => n === "package/metadata.json" || n.endsWith("/package/metadata.json")), false);
    assert.equal(names.some((n) => n.startsWith("supergrok-usage-kde-widget-")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
