"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function JoinByCodePage({
  params,
}: {
  params: { inviteCode: string };
}) {
  const router = useRouter();
  const inviteCode = params.inviteCode;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

      {!error ? (
        <p className="mt-4 text-sm text-gray-600">参加処理中...</p>
      ) : (
        <div className="mt-4 border rounded p-3 text-sm text-red-700 bg-red-50">
          エラー：{error}
        </div>
      )}
    </main>
  );
}
