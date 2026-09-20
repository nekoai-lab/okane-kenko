/**
 * 承認画面の認証（フェーズ2b）。**合言葉1つ。ユーザー登録も権限管理もしない。**
 *
 * 現行の Cloud Run は `--allow-unauthenticated`（URLを知っていれば誰でも開ける）で、
 * 承認画面はそこに置けない。IAM 認証に切り替えると本体まで認証必須になり、
 * 検証ビルドを配れなくなる。**そこで、この画面だけを合言葉で閉じる。**
 *
 * クッキーに合言葉そのものは入れない。サーバだけが持つ値から導いた token を入れる。
 * 比較は時間一定（`timingSafeEqual`）で行う。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "okane_admin";

/** 合言葉から、クッキーに入れる値を作る。**元の合言葉は復元できない。** */
export function tokenFor(password: string): string {
  return createHmac("sha256", password).update("okane-kenko/admin/v1").digest("hex");
}

function equals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 合言葉が正しいか。**未設定なら常に false**（設定し忘れを「誰でも入れる」にしない） */
export function checkPassword(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return equals(input, expected);
}

/** クッキーの値が正しいか。**未設定なら常に false** */
export function checkToken(token: string | undefined, expected: string | undefined): boolean {
  if (!expected || !token) return false;
  return equals(token, tokenFor(expected));
}
