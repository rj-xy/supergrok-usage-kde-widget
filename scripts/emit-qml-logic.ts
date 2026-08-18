// Turn tsc's ESM emit into a QML JavaScript library.
// Plasma can import .js with `.pragma library`; it cannot import TypeScript,
// and it only treats .mjs as ES modules.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function stripConstsImports(source: string): string {
  return source
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/consts\.js["'];\s*/gm, "")
    .replace(/^export\s*\{[\s\S]*?\}\s*from\s*["']\.\/consts\.js["'];\s*/gm, "");
}

export function toQmlLibrary(logicJs: string, constsJs = ""): string {
  const consts = constsJs.replace(/^export /gm, "");
  const body = stripConstsImports(logicJs).replace(/^export /gm, "");
  return [
    ".pragma library",
    "// Generated from src/consts.ts and src/logic.ts by `npm run build`. Do not edit.",
    consts.trimEnd(),
    body.trimEnd(),
    "",
  ].filter((part, index) => index < 2 || part !== "").join("\n");
}

export function emitQmlLibrary(root = join(dirname(fileURLToPath(import.meta.url)), "..")): string {
  const constsJs = readFileSync(join(root, "dist", "consts.js"), "utf8");
  const logicJs = readFileSync(join(root, "dist", "logic.js"), "utf8");
  const out = join(root, "package", "contents", "code", "logic.js");
  writeFileSync(out, toQmlLibrary(logicJs, constsJs));
  return out;
}

const entry = process.argv[1];
const isMain = !!entry && import.meta.url === pathToFileURL(resolve(entry)).href;
if (isMain)
  console.log(`› wrote ${emitQmlLibrary()}`);
