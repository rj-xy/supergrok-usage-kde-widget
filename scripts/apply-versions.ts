import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

type PlasmaMetadata = {
  KPlugin: {
    Version: string;
  };
};

export function applyVersions(
  version: string,
  root = join(dirname(fileURLToPath(import.meta.url)), ".."),
): void {
  const match = SEMVER.exec(version);
  if (!match)
    throw new Error(`invalid version: ${version}`);
  const [, maj, min] = match;

  const metaPath = join(root, "package", "metadata.json");
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as PlasmaMetadata;
  if (meta.KPlugin.Version !== version) {
    meta.KPlugin.Version = version;
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 4)}\n`);
  }

  const constsPath = join(root, "src", "consts.ts");
  const consts = readFileSync(constsPath, "utf8");
  const next = consts
    .replace(
      /export const CLIENT_VERSION = "[^"]*";/,
      `export const CLIENT_VERSION = "${version}";`,
    )
    .replace(
      /export const USER_AGENT = "supergrok-usage-kde-widget\/[^"]*";/,
      `export const USER_AGENT = "supergrok-usage-kde-widget/${maj}.${min}";`,
    );
  if (!next.includes(`export const CLIENT_VERSION = "${version}";`))
    throw new Error("failed to update CLIENT_VERSION in src/consts.ts");
  if (next !== consts)
    writeFileSync(constsPath, next);
}

const entry = process.argv[1];
const isMain = !!entry && import.meta.url === pathToFileURL(resolve(entry)).href;
if (isMain) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: tsx scripts/apply-versions.ts X.Y.Z");
    process.exit(1);
  }
  applyVersions(version);
}
