/**
 * POST /api/watch/consent のリクエスト検証。
 *
 * /result と同じ区分コード(URLクエリ文字列)をそのまま受け取り、サーバ側で
 * decodeSelections → toCompleteSelections → normalize → diagnose を通す。
 */
import { z } from "zod";

export const ConsentRequestSchema = z.object({
  query: z.string().min(1),
});

export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
