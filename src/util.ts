import { homedir } from "node:os";
import type { JsonObject } from "./types.js";

export function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function expandTilde(path: string): string {
  return path.replace(/^~(?=\/|$)/, homedir());
}

export function nowRfc3339(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
