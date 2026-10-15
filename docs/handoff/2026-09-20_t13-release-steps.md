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

> **2026-09-20 に実際にやったときの記録。** ここで30分溶かしたので、順番どおりにやること。
> 詰まるのは Slack ではなく、**ターミナルへの貼り付け**である。

### S1-1 通知用のチャンネルを先に作る

Slack サイドバーの「チャンネル」横の ＋ →「チャンネルを作成」。名前は `okane-kenko-notice` など。
**公開チャンネルにする**（非公開だと、自分が参加していない限り Webhook 発行時のプルダウンに出てこない）。
専用チャンネルにしておくと、デモ動画を撮るときに他の会話が映り込まない。

**あとからチャンネルを変えると Webhook URL を発行し直すことになる**（`.env.local` と Secret Manager の値も差し替え）。最初に決め切る。

### S1-2 Slack App を作って Webhook を発行する

1. https://api.slack.com/apps →「Create New App」
2. **「Blank app」を選ぶ**（"Empty app with minimal setup"）。
   初期選択が「AI agent」になっているので、**クリックして選択を移してから** Continue する
3. アプリ名（`okane-kenko 気づき通知` など）とワークスペースを選ぶ
4. 左メニュー「Incoming Webhooks」→ **Activate Incoming Webhooks を On**
5. 下に現れる「Add New Webhook to Workspace」→ S1-1 のチャンネルを選んで「許可する」
6. 「Webhook URLs for Your Workspace」に `https://hooks.slack.com/services/T.../B.../xxxx` が出る

会社のワークスペースだと管理者承認が要る設定のことがあり、その場合は承認されるまでこの欄が空のままになる。
**欄が空なら curl 以前の問題**なので、先にそこを確認する。

### S1-3 `.env.local` に書く ─ ターミナルに貼らない

**Webhook URL をターミナルに直接貼らない。** エディタで `.env.local` に書く。

```bash
cd ~/Desktop/ai-driven/okane-kenko
open -e .env.local
```

Slack の Copy ボタンでコピーし、エディタに貼って保存する。**クォートで囲まない。**

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxxx
```

なぜターミナルに貼らないか:

- **コマンドをコピーした時点で、クリップボードの Webhook URL が消える。**
  `pbpaste` から読む方法は、手順書のコマンドをコピペして使う流れと両立しない（実際にこれで詰まった）
- 貼り付けで**不可視文字**（ゼロ幅スペース・BOM）が混ざると `curl: (3) URL rejected: Malformed input to a URL function` になる。
  2026-08-30 に `GEMINI_API_KEY` で同じ事故を踏み、`sanitizeApiKey` を入れた原因がこれ
- シングルクォートが閉じずに `quote>` で固まる

残り2つは値に癖がないので、ターミナルから追記してよい。

```bash
echo "" >> .env.local
echo "WATCH_CRON_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "WATCH_BASE_URL=http://localhost:3000" >> .env.local
```

> **1行目の `echo ""` を省かない。** `.env.local` の末尾に改行が無いと、
> `WATCH_CRON_SECRET=` が `SLACK_WEBHOOK_URL=` の行末にくっついて1行になる（実際になった）。
> `WATCH_CRON_SECRET` は S5 と S9 でも同じ値を使うので、ここで作った値を使い回す。

### S1-4 疎通テスト ─ ファイルから読んで送る

```bash
HOOK=$(grep -m1 '^SLACK_WEBHOOK_URL=' .env.local | cut -d= -f2- | tr -d '[:space:]')
echo ${#HOOK}
curl -s -o /dev/null -w 'status=%{http_code}\n' -X POST -H 'Content-type: application/json' -d '{"text":"test"}' "$HOOK"
```

`80` 前後の文字数と `status=200` が出て、チャンネルにメッセージが届けば成功。

**この読み方（`grep | cut`）は S5 で Secret Manager に入れるときとまったく同じ**なので、
ここが通れば S5 も通る。逆にここで空になるなら、S5 では空の Secret ができていた。

> Slack の成功レスポンスは `ok` の3文字で、**改行が付かない**。
> `-w` を付けずに実行すると、プロンプトとくっついて `oktsuki@... %` と表示され、見落とす。

### S1-5 確認

```bash
grep -c '^SLACK_WEBHOOK_URL=\|^WATCH_CRON_SECRET=\|^WATCH_BASE_URL=' .env.local
```

**完了の合図**：`3` が返り、S1-4 が `status=200`。

> `2` しか返らないときは、行がくっついている（上記の改行の件）。
> 値は出さずにキー名だけ確認できる → `grep -o '^[A-Z_]*=' .env.local`

### 無料プランで踏むこと

無料プランでも Incoming Webhook は普通に使える。ただし2つ。

- **アプリ連携は10個まで。** 枠が埋まっていると追加できない。使っていないものを外すか、別ワークスペースを作る
- **メッセージ履歴は直近90日。** 通知は90日で見えなくなるので、**届いた画面はスクショか録画で残す**。
  ただし監査の証跡は Firestore の `notice_log` 側に持たせる設計なので、システムとしての記録は消えない

なお今回の通知は**固定文言で数字を含まない**設計なので、履歴が消えて困る情報は Slack 側に乗らない。
金額は本人が `/notice/{token}` から能動的に開いたときだけ出る。

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
# 実行SAはプロジェクト全体で roles/editor を持っており、editor に Datastore の
# 読み書きが含まれる（2026-09-20 に確認）。この行は実質不要で、権限が明示になるだけ。
# 一方 S5 の secretmanager.secretAccessor は editor に含まれないので、S5 は省略できない。
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${RUNTIME}" --role="roles/datastore.user"
```

**完了の合図**：`databases list` に `(default)` / `asia-northeast1` / `FIRESTORE_NATIVE` が並ぶ。

> `households` と `notice_log` は**まだ存在しない。これで正しい。**
> Firestore は空のコレクションを持てず、**最初の1件を書き込んだ瞬間にコレクションが生まれる**。
> 姿が見えるのは S4 の手順2（保存）を通ってから。読み書きの確認も S4 でやる。
>
> **Firebase コンソールにも出ない。これも正しい。** GCP 側で作ったプロジェクトは
> 「Firebase を追加」するまで Firebase コンソールの一覧に現れない。追加する必要はない
> （理由は `docs/CONTEXT.md` の「GCPプロジェクト / Firebaseプロジェクト」）。
> 見るのはこちら → https://console.cloud.google.com/firestore/databases/-default-/data?project=okane-kenko-507122

## S4 ローカルで一連の流れを通す（いちばん大事）

ここが通らないうちは先に進まない。**本番に出してから直すのがいちばん高くつく。**

1. `npm run dev` → `/wizard` を完了して `/result` へ。
   **子の生年は「今年ちょうど節目の年齢になる」ものにする。**
   節目は **3・6・12・15・18・22歳**（`params` の教育費段階から導出。コードには書かれていない）。
   年齢は「今年 − 生年」の単純計算なので、**2026年なら生年 `2020`（＝6歳・小学校）** が分かりやすい。
   §S4補足のとおり `lastCheckedAt` を1年戻すと「5歳→6歳」で節目をまたぐ。
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

> **これは自分のターミナルで、1行ずつ貼らずにブロックごと実行する。**
> AIエージェントには実行できない（`.env.local` の読み取りがフックでブロックされる。設計どおり）。
> Claude Code のプロンプトから `!` を付けて流すのも同じ理由で通らない。
>
> **`!` を自分のターミナルに貼らない。** zsh では `!` がヒストリ展開の記号で、
> `!cd ...` が「直前の `cd` で始まるコマンドの全文」に置き換わる。
> 2026-09-20 にこれで `unrecognized arguments: /Users/.../okane-kenko` を踏んだ。
> `${RUNTIME}` を使うので、`PROJECT` / `PROJNUM` / `RUNTIME` を定義したのと同じシェルで実行すること。

**完了の合図**：`gcloud secrets list` に2つ並び、実行SAに accessor が付いている。

**空でないことも確かめる**（値は表示されない。crc32c が `0` なら空）。

```bash
for S in slack-webhook-url watch-cron-secret; do
  printf '%-20s crc32c=' "$S"
  gcloud secrets versions access latest --secret=$S --project=$PROJECT \
    --format="value(payload.dataCrc32c)"
done
```

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
curl -X POST https://<公開URL>/api/watch/run \
  -H "X-Watch-Secret: <WATCH_CRON_SECRET の値>"
```

期待：401 でも 500 でもなく `{"checked":N,...}` が返る。
`401` ならシークレット不一致、`500 misconfigured` なら `--set-secrets` / `--set-env-vars` の反映漏れ。

**完了の合図**：本番URLからウォッチャーが1周まわる。

## S9 Cloud Scheduler ジョブを作る（人手）─ **本運用まで保留**

> **2026-09-20 に「いまは作らない」と判断した。** 保存された世帯が0件なので、
> 定期実行しても毎週 `checked:0` を返すだけで、動いている証拠にならない。
> **再開条件は「実在の利用者が1件でも保存に同意したとき」**（＝ n1 を実施するとき）。
> それまでは S8 の手打ちで確認できる。API（`cloudscheduler.googleapis.com`）は有効化済み。

```bash
gcloud scheduler jobs create http watch-notify-weekly \
  --project=okane-kenko-507122 \
  --location=asia-northeast1 \
  --schedule="0 9 * * 1" \
  --time-zone="Asia/Tokyo" \
  --uri="https://<公開URL>/api/watch/run" \
  --http-method=POST \
  --headers="X-Watch-Secret=<WATCH_CRON_SECRET の値>"
```

毎週月曜9時（JST）。`gcloud scheduler jobs run watch-notify-weekly` で手動実行して確かめられる。

> **`--time-zone` を省かない。** 既定は UTC なので、`0 9 * * 1` が月曜18時（JST）になる。

**完了の合図**：手動実行で `notice_log` に1行増える。**ここで T-13 フェーズ2a は完全に完了。**
（保留中でも S8 まで通っているので、**仕組みとしては動いている**。残るのは定期実行の自動化だけ。）

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
| `curl: (3) URL rejected: Malformed input to a URL function` | 貼り付けで不可視文字か改行が混入。ターミナルに貼らず `.env.local` に書く（S1-3） |
| ターミナルが `quote>` で固まる | シングルクォートが閉じていない。`Ctrl+C` で抜ける |
| curl が何も返さないように見える | Slack の `ok` は改行なし。`-w 'status=%{http_code}\n'` を付ける |
| `.env.local` のキーが1つ足りない | 末尾に改行が無く、前の行にくっついた（S1-3） |
| commit が中止される | pre-commit の lint / typecheck / `npm test` のどれかが落ちている。**テストを直すのではなく実装を疑う** |
