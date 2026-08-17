#!/usr/bin/env node
/**
 * ファイル読み取り前のガード ─ .env 系の実値を読ませない（CLAUDE.md「秘密情報の扱い」）
 *
 * .env.example だけは読める。ここに「キー名と用途」しか書かれていないため。
 * Claude Code 側は settings.json の permissions.deny でも塞いでいる（二重で止める）。
 * Cursor 側はこのフック（beforeReadFile）が唯一の防波堤になる。
 *
 * Cursor 側は failClosed なので、読ませる場合でも必ず stdout に JSON を書くこと。
 */
import { basename } from "node:path";

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

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
    allow();
  }
  if (typeof filePath !== "string" || filePath === "") allow();

  const name = basename(filePath);
  if (name !== ".env.example" && /^\.env(\.|$)/.test(name)) {
    const reason = `${name} には秘密情報の実値が入ります。読めるのは .env.example だけです`;
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: `ブロックしました：${reason}`,
        agent_message: `${reason}。必要な環境変数の名前と用途は .env.example を見てください。`,
      }),
    );
    process.stderr.write(`ブロックしました：${reason}\n`);
    process.exit(2);
  }
  allow();
});
