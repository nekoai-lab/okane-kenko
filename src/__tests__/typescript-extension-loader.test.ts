import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

const require = createRequire(import.meta.url);
const loader = require("../../scripts/typescript-extension-loader.cjs");

test("Turbopack の読み替えは .ts → .tsx → .js の順で、モジュール指定だけに適用する", () => {
  const directory = mkdtempSync(join(tmpdir(), "okane-extension-"));
  try {
    for (const name of ["a.ts", "a.tsx", "a.js", "b.tsx", "b.js", "c.js"]) {
      writeFileSync(join(directory, name), "");
    }
    const source = [
      "import a from './a.js';",
      "export { b } from './b.js';",
      "import('./c.js'); require('./a.js');",
      "import './b.js'; import('./missing.js');",
      "const s = './a.js'; import x from 'package.js'; // './a.js'",
    ].join("\n");
    const actual = loader.call(
      { resourcePath: join(directory, "entry.ts"), addDependency() {} },
      source,
    );
    assert.equal(
      actual,
      source
        .replace("from './a.js'", "from './a.ts'")
        .replace("from './b.js'", "from './b.tsx'")
        .replace("require('./a.js')", "require('./a.ts')")
        .replace("import './b.js'", "import './b.tsx'"),
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});
