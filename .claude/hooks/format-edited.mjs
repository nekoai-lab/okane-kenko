#!/usr/bin/env node
/**
 * 編集・作成した直後に Biome の Formatter だけを走らせる（CLAUDE.md「PostToolUse」）
 *
 * lint の自動修正はしない。書式は機械が整えてよいが、
 * コードの意味を変える修正は人間の目を通すべきなので、ここでは分けている。
 * 整形に失敗しても作業は止めない（フォーマッタは検査ではない）。
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"]);

// カレントディレクトリに依存させない。相対パスで解決すると、呼び出し元の cwd が
// プロジェクト直下でないときに「整形したつもりで何もしていない」状態になる。
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BIOME = join(PROJECT_ROOT, "node_modules/.bin/biome");

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let filePath = "";
  try {
    const payload = JSON.parse(input);
    filePath = payload?.tool_input?.file_path ?? payload?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  if (typeof filePath !== "string" || !TARGET_EXT.has(extname(filePath))) process.exit(0);

  const target = isAbsolute(filePath) ? filePath : join(PROJECT_ROOT, filePath);
  if (!existsSync(BIOME) || !existsSync(target)) process.exit(0);

  try {
    execFileSync(BIOME, ["format", "--write", target], { cwd: PROJECT_ROOT, stdio: "ignore" });
  } catch {
    // 整形できなくても編集自体は成立している
  }
  process.exit(0);
});
