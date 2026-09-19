# T-13 気づき通知 ─ 公開までの手順（2026-09-20）

> **この文書は「残りをどう終わらせるか」の作業手順書である。** 何を作るか・なぜそうするかは
> [`docs/hackathon/2026-09-19_vol5-handoff.md`](../hackathon/2026-09-19_vol5-handoff.md)（方針と着手順の正本）と
> [`docs/hackathon/2026-09-14_watch-notify-design.md`](../hackathon/2026-09-14_watch-notify-design.md)（設計）にある。
>
> 作業を始める前に [`CLAUDE.md`](../../CLAUDE.md) を読むこと。

## 公開ゲート ─ 先に読むこと

**すべてローカルで確かめ終わるまで、`main` にマージしない。**

`main` にマージした瞬間に Cloud Build が走り、公開URLが差し替わる。
Cloud Build のトリガー `deploy-main` は `^main$` にしか反応しないので、
**作業ブランチをいくら push しても本番は何も変わらない。** 安心して S1〜S6 を回してよい。

公開を最後に寄せる理由は2つある。

1. `cloudbuild.yaml` が参照する Secret が1つでも無いと deploy ステップで落ちる。
   Secret を作る前にマージすると、自動デプロイが赤で止まる
2. 現行の公開URLは n1 用の検証ビルドとして配っている。壊れた版に差し替えない

## いまの地点

- 作業ブランチ `feat/t13-watch-notify`（push 済み・**PR未作成**）。`origin/main` は `941d892`
- T-13 フェーズ2a の実装（Task 1〜10）はコミット済み。**167テスト green / typecheck クリーン**
- 残っているのは、この文書の S1 以降（＝実装計画の Task 11）だけ

---

## S1 Slack Incoming Webhook を発行する（人手・ブラウザ）

Slack ワークスペースで「Incoming Webhooks」アプリを追加し、通知先チャンネルを選んで URL を発行する。
デモ用は単一 Webhook でよい（法人ごとに配る Slack App 化は設計のスコープ外）。

発行したら `.env.local` に3つ書く。

```
SLACK_WEBHOOK_URL=<発行したWebhook URL>
WATCH_CRON_SECRET=<openssl rand -hex 32 で生成した値>
WATCH_BASE_URL=http://localhost:3000
```

`WATCH_CRON_SECRET` は**あとで Secret Manager と Cloud Scheduler にも同じ値を入れる**ので、ここで作った値を使い回す。

> `.env.local` は Git に含まれない。AIエージェントは実値を読めない設定になっている（`.env.example` は読める）。

**完了の合図**：`.env.example` の3キーが `.env.local` に実値で揃っている。

## S2 ローカルから Firestore を触れるようにする（人手）

```bash
gcloud auth application-default login
```

サービスアカウントキーのファイルはダウンロードしない。

**完了の合図**：`npm run dev` から Firestore に書ける。

## S3 Firestore を有効化し、実行SAに権限を付ける（人手）

Phase A の「DBなし」を初めて崩す。**既にあるかを先に確認する**（create は既存だとエラーになる）。

```bash
PROJECT=okane-kenko-507122
PROJNUM=84783545243
RUNTIME="${PROJNUM}-compute@developer.gserviceaccount.com"

# Firestore API はこのプロジェクトでまだ有効化されていない（2026-09-20 に確認）。
# 先に enable しないと、次の list が「有効化しますか？」の対話プロンプトで止まる。
gcloud services enable firestore.googleapis.com --project=$PROJECT

gcloud firestore databases list --project=$PROJECT
gcloud firestore databases create --project=$PROJECT \
  --location=asia-northeast1 --type=firestore-native
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${RUNTIME}" --role="roles/datastore.user"
```

**完了の合図**：`households` と `notice_log` を読み書きできる。

## S4 ローカルで一連の流れを通す（いちばん大事）

ここが通らないうちは先に進まない。**本番に出してから直すのがいちばん高くつく。**

1. `npm run dev` → `/wizard` を完了して `/result` へ。
   **子の生年は「節目の1つ手前」にする**（節目年齢は `params` の教育費段階から導出。§S4補足）
2. 「この結果を保存して〜」→ `/save` →「保存してお知らせを受け取る」
3. Firestore コンソールで `households` に1件できていることを確認
   （`token` / `wizardSelections` / `lastDiagnosis` / `consentedAt`）
4. ウォッチャーを手で1周まわす

```bash
curl -X POST http://localhost:3000/api/watch/run \
  -H "X-Watch-Secret: <WATCH_CRON_SECRET の値>"
```

期待：`{"checked":1,"notified":1,"errors":[]}` が返り、Slack に
「お子さんが◯歳になりました。前回の診断からの変化を確認できます。」＋ `/notice/{token}` のリンクが届く。
**金額が1つも含まれていないことを目で確かめる**（設計の芯。通知はきっかけだけにする）。
なお**年齢の数字は文面に入る**（`describeCrossing`）。これは設計どおりなので、見えても正しい。

5. リンクを開く → `/notice/{token}` に金額が出ていないこと → 「詳しく見直す」→ `/result` が出ること
6. もう一度 `/notice/{token}` を開き「この記録を削除する」→ Firestore から消えること（SPEC.md US-10 を即時で満たす）
7. もう一度 4 を叩き、今度は `notified:0` になること（`lastNotifiedAt` が効いて二重通知しない）

**完了の合図**：Slack → 着地画面 → `/result` → 削除、が実物で通る。`notice_log` に `notified` と `silent` の両方が残る。

### S4 補足：節目に当たる世帯が作れないとき

`crossedMilestones` は「前回チェック時の年齢」と「今回の年齢」が節目をまたいだかで判定する。
新規保存した直後は `lastCheckedAt` が保存時刻なので、**またぎが発生せず `silent` になるのが正しい**。
実物で通知を出すには、Firestore コンソールで当該世帯の `lastCheckedAt` を1年前に手で戻してから 4 を叩く。
（テストでは境界値を単体で押さえてある：`src/watch/milestones.test.ts`）

## S5 Secret Manager に2つ作る（人手）

**マージ前に必ず終わらせる。** `cloudbuild.yaml` が参照するので、無いと deploy が落ちる。
手順の正本は [`docs/本番前チェックリスト.md`](../本番前チェックリスト.md) §G-2。値をターミナルに残さない形になっている。

```bash
grep -m1 '^SLACK_WEBHOOK_URL=' .env.local | cut -d= -f2- | tr -d '\r\n' \
  | gcloud secrets create slack-webhook-url --data-file=- --replication-policy=automatic
grep -m1 '^WATCH_CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n' \
  | gcloud secrets create watch-cron-secret --data-file=- --replication-policy=automatic

for S in slack-webhook-url watch-cron-secret; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${RUNTIME}" --role="roles/secretmanager.secretAccessor"
done
```

**完了の合図**：`gcloud secrets list` に2つ並び、実行SAに accessor が付いている。

> `WATCH_BASE_URL` は Secret にしない。通知リンクを組み立てる公開URLで秘密ではないため、
> `cloudbuild.yaml` の `--set-env-vars` で素のまま渡している。**URLを変えるときは `cloudbuild.yaml` を直す。**

## S6 検査を通す

```bash
npm test && npm run typecheck && npm run lint
```

期待：167テスト green・型エラーなし・lint は `Checked NN files. No fixes applied.`

> **コマンドの末尾に `#` のコメントを付けない。** シェルによっては引数として渡り、
> biome が「そんなファイルはない」という `internalError/io` を出す（2026-09-20 に踏んだ）。

**完了の合図**：3つとも green。ここまでで公開の準備が整う。

## S7 公開する（PR → マージ → 自動デプロイ）

```
https://github.com/nekoai-lab/okane-kenko/pull/new/feat/t13-watch-notify
```

`main` への直接 push はフックで禁止しているので、必ず PR を通す。
マージすると Cloud Build `deploy-main` が走り、公開URLが新しい版に差し替わる。

**完了の合図**：ビルドが SUCCESS。Secret の付け忘れがあればここで落ちる（S5 をやり直す）。
→ https://console.cloud.google.com/cloud-build/builds;region=asia-northeast1?project=okane-kenko-507122

## S8 本番で1周まわす

```bash
curl -X POST https://okane-kenko-caiwgo7uta-an.a.run.app/api/watch/run \
  -H "X-Watch-Secret: <WATCH_CRON_SECRET の値>"
```

期待：401 でも 500 でもなく `{"checked":N,...}` が返る。
`401` ならシークレット不一致、`500 misconfigured` なら `--set-secrets` / `--set-env-vars` の反映漏れ。

**完了の合図**：本番URLからウォッチャーが1周まわる。

## S9 Cloud Scheduler ジョブを作る（人手）

```bash
gcloud scheduler jobs create http watch-notify-weekly \
  --project=okane-kenko-507122 \
  --location=asia-northeast1 \
  --schedule="0 9 * * 1" \
  --uri="https://okane-kenko-caiwgo7uta-an.a.run.app/api/watch/run" \
  --http-method=POST \
  --headers="X-Watch-Secret=<WATCH_CRON_SECRET の値>"
```

毎週月曜9時（JST）。`gcloud scheduler jobs run watch-notify-weekly` で手動実行して確かめられる。

**完了の合図**：手動実行で `notice_log` に1行増える。**ここで T-13 フェーズ2a は完了。**

## S10 後始末（人間の確認が要る）

CLAUDE.md の規定により、`docs/ADR.md` と `docs/CONTEXT.md` はAIが勝手に編集しない。**文案を出して承認を取る。**

- [ ] `docs/SPEC.md` の Out of Scope 表：「継続伴走・再診断の自動トリガー＝Phase2」の行を着手済みに更新
- [ ] `docs/ADR.md`：Phase A（DBなし）を崩す決定を追記（設計書 §9 が起票対象と明記）
- [ ] `docs/TICKETS.md` の T-13 完了条件にチェックを入れる
- [ ] `docs/STATUS.md` を更新（ハンドオフを書いたら STATUS も一緒に、が運用ルール）

## この後（10/15 提出に向けて）

**フェーズ2b（制度側の自律監視）が本丸。** 審査軸②がいま空で、2a では埋まらない。
設計から書き起こす。範囲・守る線・完了の合図は
[`docs/hackathon/2026-09-19_vol5-handoff.md`](../hackathon/2026-09-19_vol5-handoff.md) §4-B にある。

## つまずきどころ（先に知っておくと早い）

| 症状 | 原因 |
|---|---|
| ブランチを push したのに公開URLが変わらない | 正常。トリガーは `^main$` にしか反応しない |
| deploy ステップで落ちる | 参照している Secret が無い（S5 を先にやる） |
| `/api/watch/run` が 401 | `X-Watch-Secret` と `WATCH_CRON_SECRET` の不一致 |
| `/api/watch/run` が 500 `misconfigured` | `SLACK_WEBHOOK_URL` か `WATCH_BASE_URL` が実行環境に届いていない |
| ローカルで `notified:0` にしかならない | 仕様どおり。`lastCheckedAt` を戻して節目をまたがせる（§S4補足） |
| lint が `internalError/io` | コマンドに余計な引数が渡っている（`#` コメントの付け忘れ事故） |
| commit が中止される | pre-commit の lint / typecheck / `npm test` のどれかが落ちている。**テストを直すのではなく実装を疑う** |
