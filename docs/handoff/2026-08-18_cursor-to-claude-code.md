---
date: 2026-08-18
from: Cursor
to: Claude Code
project: okane-kenko
---

# 申し送り ─ Cursor から Claude Code へ運用を移す（2026-08-18）

## TL;DR

- リポジトリは GitHub に上がっている。`main` は `4d554ff`。**[PR #1](https://github.com/nekoai-lab/okane-kenko/pull/1)（README 修正）が未マージ**で、ローカルは `docs/readme-sync` ブランチにいる
- 次の本線は T-02（Next.js の器と `POST /api/diagnose`）。ただし **`CLAUDE.md` に3行入れてから着手する**こと。理由は「着手前にやること」に書いた
- スキルのファイル重複は 2026-08-18 朝の整理で解消済み。**残っているのは「同じ役割のスキルが二重にある」問題**で、こちらのほうが検出しにくい

---

## いまのリポジトリの状態

- `main`：2コミット・37ファイル・Private。既定ブランチは `main`
- 未マージ：[PR #1](https://github.com/nekoai-lab/okane-kenko/pull/1) `docs/readme-sync`（README を現状に合わせた8行の変更。mergeable）
- ローカルの現在ブランチ：`docs/readme-sync`（作業ツリーはクリーン。**本ファイルだけが未追跡**）
- pre-commit：`biome lint` → `tsc --noEmit` → `npm test`（**70件パス**）。3段とも通ることを確認済み
- 空いている穴：`main` は無保護、CI なし、LICENSE なし、リポジトリの description が空

`main` への直接 push はフックが止める。ただし**このフォルダで動くエージェントにしか効かない**。GitHub 側の branch protection が本来の防波堤。

---

## 着手前にやること（順序が重要）

### 1. `CLAUDE.md` に3点を追記する

**`domain-modeling` と `tdd` が走る前に入れる必要がある。** 逆順だとルールの無い状態で走る。

1. **ドキュメントの実配置**：用語集は `docs/CONTEXT.md`、ADR は**単一ファイルの** `docs/ADR.md`。ルートに `CONTEXT.md` を作らない、`docs/adr/` ディレクトリを作らない
   - 理由：`domain-modeling` はルートの `CONTEXT.md` と `docs/adr/` ディレクトリを前提にし、「無ければ遅延生成せよ」と指示している。放置すると2つ目の用語集と2つ目の ADR 置き場ができる
2. **`docs/CONTEXT.md` と `docs/ADR.md` は人間の確認なしに編集しない**
   - 理由：`domain-modeling` は「用語が決まったら `CONTEXT.md` をその場で更新せよ。溜めるな」と指示していて、確認を求めるのは ADR だけ。`docs/ADR.md` は14件の取り消しにくい決定を持つ
3. **ゴールデンテストの期待値は `docs/算定テスト_10世帯.xlsx` の検算を正本とする。red→green のために期待値を書き換えない**
   - 理由：`tdd` 自身が「期待値は独立した正本（既知の正しいリテラル・検算例・仕様）から来なければならない」と書いており思想は一致している。だが**どのファイルが正本かは `CLAUDE.md` に書かれていない**

### 2. `/setup-matt-pocock-skills` を1回実行する

`code-review` は `docs/agents/issue-tracker.md` が無いと動かない（スキル本体に「無ければ `/setup-matt-pocock-skills` を実行しろと伝えよ」と書かれている）。

回答方針は決めてある。

- **Section A（issue tracker）は Other**。「仕様は `docs/SPEC.md`、チケットは `docs/TICKETS.md`（T-01〜T-12）。GitHub Issues は使わない」と記述する
  - `code-review` の spec 探索順に「`docs/` 配下の spec ファイル」が含まれるので、トラッカー無しでも成立する
  - Local markdown を選ぶと `.scratch/<feature>/issues/NN-*.md` という別の置き場ができ、`docs/TICKETS.md` と二重管理になる
- **Section B（トリアージ用ラベル）は不要**と答え、`docs/agents/triage-labels.md` を書かせない。GitHub Issues を使わないので状態遷移させる対象が無い
- **Section C は single-context**。ただし既定の「ルートの `CONTEXT.md` + `docs/adr/`」ではなく**実際の配置**を書かせる

このスキルは `CLAUDE.md` が存在するので `CLAUDE.md` に `## Agent skills` ブロックを追記する。**書き込み前にドラフトを確認し、`git diff` で既存セクション（やらないこと・責務境界・Hooks・デザイン）が一切変わっていないことを確かめてから commit する。**

---

## スキルの重複について

### 解消済み

`research` と `writing-great-skills` は 2026-08-18 朝に `~/.claude/skills/` から外れている（実体の `~/.agents/skills/` にも無い）。プラグインが同名スキルを持つため二重になっていたが、いまは1本ずつ。

### 残っている ─ ファイルではなく「役割」の二重装備

`~/.agents/skills/` にある obra/superpowers 由来の3つが、mattpocock フローと同じ役割を主張している。**どれも Model-invoked（自律起動可能）なので、先に起動したほうが手順を決める。**

- **`brainstorming`** ─ 「機能を作る・コンポーネントを作る・挙動を変える前に**必ず**使え」と主張。`grill-with-docs` / `grilling` と正面衝突する
- **`writing-plans`** ─ 「spec や要件があって多段タスクなら、コードを触る前に使え」。`to-spec` / `to-tickets` / `implement` と衝突する
- **`systematic-debugging`** ─ 「バグ・テスト失敗・想定外の挙動に遭遇したら、修正案を出す前に**必ず**」。プラグインの `diagnosing-bugs` と衝突する

これは決定ログ [2026-08-18_skill-distribution-drift-detection](https://github.com/nekoai-lab/claude-skills-private) の「**ドリフトは未登録より危険（黙って旧手順が走る）**」と同じ形の危険が、配布先の差ではなく**同じ役割の二重装備**として現れたもの。

そして `skill-audit` の Stage 2.5 は「repo の `skills/`」と「claude.ai のキャッシュ」を比べる設計なので、**この軸（プラグイン35個 × `~/.agents/skills` 24個の役割重複）は検査対象に入っていない**。

判断は急がなくてよい。ただし okane-kenko で mattpocock フローを使うと決めたなら、**どちらを主にするかを一度決めて書き留める**ほうがいい。決めないと、セッションごとに違う手順で走る。

---

## 事実として押さえておくこと

- プラグイン：`mattpocock-skills@mattpocock` v1.2.3、**35スキル**、2026-08-17 22:24 導入、user スコープ、`gitCommitSha 9c9f36c`
- `~/.claude/skills/` は28項目。うち24本が `~/.agents/skills/` へのシンボリックリンク（skills.sh 管理・`~/.agents/.skill-lock.json`）、1本が `claude-skills-private/skills/biz-validation-framework`、1本が `Documents/.../marcrevix-slides`、そして **`end-of-day` と `wip-board` だけが実体のディレクトリ**（repo 版と現時点では同一。ただしリンクではないので将来ドリフトしうる）
- **Cursor 固有の制約は Claude Code では無関係**。Cursor は個別スキルを無効化できず、プラグインキャッシュを読むことも公式には未記載だった。Claude Code ではプラグインが本来の経路なので、この制約は消える
- `implement` は本体9行。「`/tdd` を使え」「型チェックと単体テストを随時、全体テストを最後に1回」「終わったら `/code-review`」「現在のブランチにコミット」だけ
- `to-spec` と `to-tickets` は `disable-model-invocation: true`。自律起動しないので、置いてあっても勝手に走らない

---

## 未解決・要確認

- **[PR #1](https://github.com/nekoai-lab/okane-kenko/pull/1) のマージ。** これが済むまで `main` から新しいブランチを切れない
- **`main` の branch protection**（GitHub 側。ローカルフックだけでは別端末から通る）
- **CI（GitHub Actions）。** pre-commit はフック未設定の環境を素通りする。ゴールデンテストが事業の核の唯一の自動検査である以上、リモートでも走らせたい。`docs/TICKETS.md` の T-02 に含まれている
- **`docs/機能仕様書_MVP.md` の参照切れ2件**（どちらもファイル名のズレ）
  - `:340` `params/2026.08.yaml` → 実体は `params/2026-08.yaml`
  - `:177` と `:694` 参照実装を `calc.py` と呼んでいる → 実体は `docs/calc-reference.py`。しかも「**実装の正本**」と書かれた箇所
- **`docs/CONTEXT.md` が自身を「grill未実施のため暫定」と書いている。** 用語集を固める仕事が残っている。`/grill-with-docs` の出番はここ（ただし上の CLAUDE.md 3点を入れてから）
- **`claude-skills-private/wip.md` に okane-kenko の項目が無い。** Active に載せるか判断が必要

---

## このファイルの扱い

- `main` から切った `docs/handoff-cursor-to-claude-code` ブランチに、このファイル単独でコミットする。[PR #1](https://github.com/nekoai-lab/okane-kenko/pull/1) とは独立した変更なので、マージを待たずに並行して出せる
- **スキル運用の話（役割の二重装備3件と `skill-audit` の検査軸）は本来 skills-ops 側の資産。** `claude-skills-private` の `projects/skills-ops.md` か `decisions/` に持ち出すこと。この okane-kenko リポジトリには開発の申し送りとして置いた
