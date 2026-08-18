import assert from "node:assert/strict";
import test from "node:test";

import { toQmlLibrary } from "../scripts/emit-qml-logic.ts";

test("toQmlLibrary is a QML pragma library without ESM exports", () => {
  const out = toQmlLibrary("export const A = 1;\nexport function foo() { return A; }\n");
  assert.match(out, /^\.pragma library\n/);
  assert.match(out, /^const A = 1;$/m);
  assert.match(out, /^function foo\(\)/m);
  assert.doesNotMatch(out, /^export /m);
});

test("toQmlLibrary inlines consts and drops ESM imports", () => {
  const out = toQmlLibrary(
    'import {\n  A\n} from "./consts.js";\nexport { A } from "./consts.js";\nexport function foo() { return A; }\n',
    "export const A = 1;\n",
  );
  assert.match(out, /^const A = 1;$/m);
  assert.match(out, /^function foo\(\)/m);
  assert.doesNotMatch(out, /consts\.js/);
  assert.doesNotMatch(out, /^export /m);
  assert.doesNotMatch(out, /^import /m);
});
