"use client";

/**
 * 保存する／しないの選択(UI案2)。保存はオプトイン(既定は非保存)。
 */
import { useState } from "react";
import s from "./page.module.css";

export function SaveConsent({ query }: { query: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await fetch("/api/watch/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { token?: string; message?: string };
      if (!res.ok || !data.token) {
        setStatus("error");
        setMessage(data.message ?? "保存できませんでした。");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("通信に失敗しました。時間をおいて試してください。");
    }
  }

  if (status === "done") {
    return <p className={s.done}>保存しました。状況が変わったらSlackでお知らせします。</p>;
  }

  return (
    <div>
      <button
        type="button"
        className={s.primaryButton}
        onClick={handleSave}
        disabled={status === "saving"}
      >
        {status === "saving" ? "保存しています…" : "保存してお知らせを受け取る"}
      </button>
      <a className={s.secondaryButton} href="/">
        保存しない
      </a>
      {status === "error" && <p className={s.error}>{message}</p>}
    </div>
  );
}
