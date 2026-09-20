/**
 * 承認画面の認証の検査。
 *
 * ここで守りたいのは1点：**設定し忘れが「誰でも入れる」にならないこと。**
 */
import { describe, expect, it } from "vitest";
import { checkPassword, checkToken, tokenFor } from "./auth.js";

describe("checkPassword", () => {
  it("合言葉が一致すれば通す", () => {
    expect(checkPassword("open-sesame", "open-sesame")).toBe(true);
  });

  it("違えば通さない", () => {
    expect(checkPassword("nope", "open-sesame")).toBe(false);
  });

  /**
   * `openssl rand -hex 24 | gcloud secrets create` で作った値は**末尾に改行が入る**。
   * Cloud Run はそのまま環境変数に渡すので、正しい合言葉を入力しても弾かれ続ける。
   * しかも画面には「合言葉が違う」としか出ない（2026-09-20 に踏みかけた）。
   */
  it("Secret Manager 由来の末尾の改行で弾かれない", () => {
    expect(checkPassword("open-sesame", "open-sesame\n")).toBe(true);
    expect(checkPassword("open-sesame\n", "open-sesame")).toBe(true);
    expect(checkPassword(" open-sesame ", "open-sesame")).toBe(true);
    // 中身が違えば、もちろん通さない
    expect(checkPassword("open-sesam", "open-sesame\n")).toBe(false);
  });

  it("**サーバ側が未設定なら、何を入れても通さない**", () => {
    expect(checkPassword("", undefined)).toBe(false);
    expect(checkPassword("anything", undefined)).toBe(false);
    expect(checkPassword("anything", "")).toBe(false);
  });
});

describe("checkToken", () => {
  it("合言葉から導いた token なら通す", () => {
    expect(checkToken(tokenFor("open-sesame"), "open-sesame")).toBe(true);
  });

  it("token に合言葉そのものを入れても通らない", () => {
    expect(checkToken("open-sesame", "open-sesame")).toBe(false);
  });

  it("クッキーの鍵も同じ正規化をかける（入れたのに毎回ログイン画面に戻る、を防ぐ）", () => {
    expect(checkToken(tokenFor("open-sesame"), "open-sesame\n")).toBe(true);
  });

  it("クッキーが無い・サーバが未設定なら通さない", () => {
    expect(checkToken(undefined, "open-sesame")).toBe(false);
    expect(checkToken(tokenFor("open-sesame"), undefined)).toBe(false);
  });
});
