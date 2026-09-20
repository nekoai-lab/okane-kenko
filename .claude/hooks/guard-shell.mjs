#!/usr/bin/env node
/**
 * シェルコマンド実行前のガード（CLAUDE.md「Bash コマンドを実行する前」）
 *
 * 止めるのは「取り消せない操作」と「秘密情報の露出」だけ。判定できないものは通す。
 * 代替手段が用意されている操作は、ブロック理由と一緒に代替を伝える。
 *
 * Claude Code（PreToolUse）と Cursor（beforeShellExecution）の両方から呼ぶ。
 * 入力の JSON の形だけが違うので、コマンド文字列の取り出し方で吸収している。
 * 出口は「stdout に判定 JSON（Cursor が読む）＋ stderr に理由（Claude Code が読む）＋ 終了コード」で揃える。
 * Cursor 側は failClosed なので、通す場合でも必ず JSON を書くこと（無言で終わると全部ブロックされる）。
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ブランチ名の判定を呼び出し元の cwd に依存させない（cwd がリポジトリ外だと判定が抜ける）
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RULES = [
  [
    /\bgit\s+push\b[^\n;&|]*(--force\b|--force-with-lease\b|(?:^|\s)-f\b)/,
    "git push --force はリモートの履歴を上書きし、取り消せません",
  ],
  [
    /\bgit\s+reset\b[^\n;&|]*--hard\b/,
    "git reset --hard は未コミットの変更を復元不能な形で破棄します。退避するなら git stash を使ってください",
  ],
  [
    /\bgit\s+clean\b[^\n;&|]*(?:^|\s)-[A-Za-z]*f/,
    "git clean -f は Git 管理外のファイルを削除します。まず git clean -n で対象を確認してください",
  ],
  [
    /\bgit\s+branch\b[^\n;&|]*(?:^|\s)-D\b/,
    "git branch -D は未マージのブランチを強制削除します。安全に消すなら git branch -d を使ってください",
  ],
  [
    /\bgit\s+(?:checkout|restore)\s+\.(?:\s|$)/,
    "作業中の変更をまとめて破棄します。戻すファイルを git restore <path> で絞ってください",
  ],
  [
    /\bgit\s+push\b[^\n;&|]*\b(?:main|HEAD:main|:main)\b/,
    "main への直接 push は禁止です（レビューを通さない変更が本番相当のブランチに入ります）。git switch -c feat/<内容> で作業ブランチを切り、Pull Request を作ってください",
  ],
  [
    /(?:\bcat\b|\bless\b|\bmore\b|\bhead\b|\btail\b|\bgrep\b|\brg\b|\bawk\b|\bsed\b|\bnl\b|\bstrings\b|\bxxd\b|\bsource\b|(?:^|\s)\.\s)[^\n]*\.env\b(?!\.example)/,
    ".env 系の実値は読み取れません（.env.example は読めます）。値の存在確認が必要なら、未設定時にエラーを投げる形で実装してください",
  ],
  [
    /\b(?:echo|printf|printenv)\b[^\n]*\$\{?\w*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)\w*/i,
    "秘密情報をターミナルやログに出力しないでください",
  ],
];

/**
 * .env 系のファイルに触れようとしているか（.env.example だけは通す）。
 *
 * 上の RULES はツール名（cat / grep / sed …）を列挙する形だったため、
 * `node -e 'readFileSync(".env.local")'` のような言語処理系からの読み取りが素通りしていた
 * （2026-09-20 に実際に通した）。フックが「読めない」と言っているのに読めてしまうと、
 * 守られているつもりの穴になるので、ツールを問わずファイル名で塞ぐ。
 *
 * 限界：ディスク上のスクリプトが .env を読む場合（`npx tsx foo.mjs` など）、
 * コマンド文字列に .env が現れないので検知できない。
 * ここで止められるのは「コマンドに .env と書いてある」ものまで。
 */
function touchesEnvFile(command) {
  const hits = command.match(/\.env(?:\.[\w-]+)*/g) ?? [];
  return hits.some((hit) => hit !== ".env.example");
}

/** 引数を持たない `git push`（＝現在のブランチをそのまま押す形）か */
function isBarePush(command) {
  const m = command.match(/\bgit\s+push\b([^\n;&|]*)/);
  if (!m) return false;
  const rest = m[1]
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-"));
  return rest.length <= 1; // 何も指定なし、または remote だけ
}

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

const HANDOFF =
  "実行が必要な場合は、何をなぜ実行したいかを人間に説明し、人間のターミナルで実行してもらってください。";

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

function block(reason) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: `ブロックしました：${reason}`,
      agent_message: `${reason}。${HANDOFF}`,
    }),
  );
  process.stderr.write(`ブロックしました：${reason}\n${HANDOFF}\n`);
  process.exit(2);
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let command = "";
  try {
    const payload = JSON.parse(input);
    command = payload?.tool_input?.command ?? payload?.command ?? "";
  } catch {
    allow(); // 解釈できない入力で作業を止めない
  }
  if (typeof command !== "string" || command === "") allow();

  if (touchesEnvFile(command)) {
    block(
      ".env 系のファイルに触れるコマンドは、ツールを問わず実行できません（.env.example は読めます）。値の存在確認が必要なら、未設定時にエラーを投げる形で実装してください",
    );
  }

  for (const [pattern, reason] of RULES) {
    if (pattern.test(command)) block(reason);
  }

  if (isBarePush(command) && currentBranch() === "main") {
    block(
      "main から直接 push しようとしています。git switch -c feat/<内容> で作業ブランチを切り、Pull Request を作ってください",
    );
  }

  allow();
});
