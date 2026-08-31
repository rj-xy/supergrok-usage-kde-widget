import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { env } from "node:process";

import { CACHE_FILE_NAME } from "./consts.js";
import type { UsageReport } from "./types.js";
import { isRecord } from "./util.js";

export function cachePathFor(dirName: string): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, dirName, CACHE_FILE_NAME);
}

export function loadCachedReport(path: string): UsageReport | null {
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(data) && Array.isArray(data.entries))
      return data as UsageReport;
  } catch {
    return null;
  }
  return null;
}

export function saveCachedReport(path: string, report: UsageReport): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(report));
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } catch {
    // cache is optional
  }
}
