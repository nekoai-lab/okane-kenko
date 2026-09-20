/**
 * POST /api/admin/login ─ 承認画面の合言葉を受け取り、クッキーを1つ置く。
 *
 * クッキーに合言葉そのものは入れない（`tokenFor` で導いた値）。
 * httpOnly / secure / sameSite=strict で、JS からも他サイトからも触れない形にする。
 */
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkPassword, tokenFor } from "../../../../src/paramwatch/auth.js";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!checkPassword(password, expected)) {
    // **理由を分けない。**「合言葉が違う」と「サーバが未設定」を区別すると、
    // 外から設定状況が読める。
    return NextResponse.redirect(new URL("/admin/login?e=1", req.url), { status: 303 });
  }

  const res = NextResponse.redirect(new URL("/admin/proposals", req.url), { status: 303 });
  res.cookies.set(ADMIN_COOKIE, tokenFor(password), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
