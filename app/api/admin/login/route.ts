/**
 * POST /api/admin/login ─ 承認画面の合言葉を受け取り、クッキーを1つ置く。
 *
 * クッキーに合言葉そのものは入れない（`tokenFor` で導いた値）。
 * httpOnly / secure / sameSite=strict で、JS からも他サイトからも触れない形にする。
 */
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkPassword, tokenFor } from "../../../../src/paramwatch/auth.js";

export const runtime = "nodejs";

/**
 * **絶対URLを組み立てない。**
 *
 * `new URL(path, req.url)` は Cloud Run ではコンテナ内部の `https://0.0.0.0:8080/...`
 * になり、ブラウザがそこへ飛ばされて行き止まる（2026-09-20 に本番で踏んだ）。
 * `x-forwarded-host` を信じて組み立てる手もあるが、**ヘッダは外から差し替えられる**ので、
 * 行き先を外部入力で決めない。相対 Location なら、そもそも組み立てる必要がない。
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!checkPassword(password, expected)) {
    // **理由を分けない。**「合言葉が違う」と「サーバが未設定」を区別すると、
    // 外から設定状況が読める。
    return redirectTo("/admin/login?e=1");
  }

  const res = redirectTo("/admin/proposals");
  res.cookies.set(ADMIN_COOKIE, tokenFor(password), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
