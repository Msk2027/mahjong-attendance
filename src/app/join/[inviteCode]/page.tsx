"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function JoinByCodePage() {
  const router = useRouter();
  const params = useParams();

  // useParams() は string | string[] | undefined になり得るので安全に処理
  const inviteCode = useMemo(() => {
    const v = params?.inviteCode;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0];
    return "";
  }, [params]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) return; // ここが空だと「引数なし」扱いになって詰むのでガード

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase.rpc("join_room_by_invite", {
          p_code: inviteCode,
        });

        if (error) throw new Error(error.message);

        const row = data?.[0];
        if (!row?.room_id) throw new Error("招待コードが無効です");

        router.replace(`/room/${row.room_id}`);
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      }
    })();
  }, [inviteCode, router]);

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">ルームに参加</h1>

      {!inviteCode ? (
        <div className="mt-4 border rounded p-3 text-sm text-red-700 bg-red-50">
          エラー：招待コードが読み取れませんでした。URLを確認してください。
        </div>
      ) : !error ? (
        <p className="mt-4 text-sm text-gray-600">参加処理中...</p>
      ) : (
        <div className="mt-4 border rounded p-3 text-sm text-red-700 bg-red-50">
          エラー：{error}
        </div>
      )}
    </main>
  );
}
