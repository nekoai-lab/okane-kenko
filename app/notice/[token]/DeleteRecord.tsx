"use client";

/**
 * 保存記録の削除(SPEC.md US-10)。確認は簡易な confirm() で十分(取り消せる操作ではないため一拍置く)。
 */
import { useState } from "react";
import s from "./page.module.css";

export function DeleteRecord({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "deleting" | "done" | "error">("idle");

  async function handleDelete() {
    if (!confirm("この診断の記録を削除しますか？削除すると、以後お知らせは届きません。")) return;
    setStatus("deleting");
    try {
      const res = await fetch(`/api/watch/households/${token}`, { method: "DELETE" });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className={s.done}>削除しました。</p>;
  }

  return (
    <div className={s.deleteRow}>
      <button
        type="button"
        className={s.deleteButton}
        onClick={handleDelete}
        disabled={status === "deleting"}
      >
        {status === "deleting" ? "削除しています…" : "この記録を削除する"}
      </button>
      {status === "error" && <p className={s.error}>削除できませんでした。</p>}
    </div>
  );
}
