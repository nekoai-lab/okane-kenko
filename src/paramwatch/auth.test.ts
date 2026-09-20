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

  it("クッキーが無い・サーバが未設定なら通さない", () => {
    expect(checkToken(undefined, "open-sesame")).toBe(false);
    expect(checkToken(tokenFor("open-sesame"), undefined)).toBe(false);
  });
});
