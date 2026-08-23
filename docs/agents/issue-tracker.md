# Issue tracker

このリポジトリは GitHub Issues を使わない。課題・作業単位は次の2ファイルが正本。

| ファイル | 役割 |
|---|---|
| `docs/SPEC.md` | 仕様 |
| `docs/TICKETS.md` | チケット（T-01〜T-12 の縦切り。実装の順序もここ） |

## スキルへの指示

- **チケットを読む/書くときは `docs/TICKETS.md` を使う。** `gh issue` コマンドを呼ばない。`.scratch/<feature>/` などの別のチケット置き場を作らない（`docs/TICKETS.md` と二重管理になる）。
- **新しいチケットは `docs/TICKETS.md` に追記する。** 既存の T-01〜T-12 の書式に合わせ、次の番号を振る。
- 仕様の参照先は `docs/SPEC.md`。
- **GitHub は PR とレビューにだけ使う。** 作業ブランチを切って PR を作る（`main` への直接 push は禁止）。
