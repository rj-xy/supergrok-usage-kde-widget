import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

type PlasmaMetadata = {
  KPlugin: {
    Version: string;
  };
};

const METADATA_PATHS = ["package-grok/metadata.json", "package-zai/metadata.json"];

export function applyVersions(
  version: string,
  root = join(dirname(fileURLToPath(import.meta.url)), ".."),
): void {
  const match = SEMVER.exec(version);
  if (!match)
    throw new Error(`invalid version: ${version}`);
  const [, maj, min] = match;

  for (const rel of METADATA_PATHS) {
    const metaPath = join(root, rel);
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as PlasmaMetadata;
    if (meta.KPlugin.Version !== version) {
      meta.KPlugin.Version = version;
      writeFileSync(metaPath, `${JSON.stringify(meta, null, 4)}\n`);
    }
  }

  const grokConstsPath = join(root, "src", "grok", "consts.ts");
  const grokConsts = readFileSync(grokConstsPath, "utf8");
  const nextGrok = grokConsts
    .replace(
      /export const CLIENT_VERSION = "[^"]*";/,
      `export const CLIENT_VERSION = "${version}";`,
    )
    .replace(
      /export const USER_AGENT = "supergrok-usage-kde-widget\/[^"]*";/,
      `export const USER_AGENT = "supergrok-usage-kde-widget/${maj}.${min}";`,
    );
  if (!nextGrok.includes(`export const CLIENT_VERSION = "${version}";`))
    throw new Error("failed to update CLIENT_VERSION in src/grok/consts.ts");
  if (!nextGrok.includes(`export const USER_AGENT = "supergrok-usage-kde-widget/${maj}.${min}";`))
    throw new Error("failed to update USER_AGENT in src/grok/consts.ts");
  if (nextGrok !== grokConsts)
    writeFileSync(grokConstsPath, nextGrok);

  const zaiConstsPath = join(root, "src", "zai", "consts.ts");
  const zaiConsts = readFileSync(zaiConstsPath, "utf8");
  const nextZai = zaiConsts
    .replace(
      /export const USER_AGENT = "zai-usage-kde-widget\/[^"]*";/,
      `export const USER_AGENT = "zai-usage-kde-widget/${maj}.${min}";`,
    );
  if (!nextZai.includes(`export const USER_AGENT = "zai-usage-kde-widget/${maj}.${min}";`))
    throw new Error("failed to update USER_AGENT in src/zai/consts.ts");
  if (nextZai !== zaiConsts)
    writeFileSync(zaiConstsPath, nextZai);
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
