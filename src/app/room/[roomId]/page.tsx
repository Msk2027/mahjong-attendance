"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Room = {
  id: string;
  name: string;
  invite_code: string | null;
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();

  const roomId = useMemo(() => {
    const v = (params as any)?.roomId;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0];
    return "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = async (text: string, doneMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(doneMsg);
    } catch {
      alert("コピーに失敗しました（ブラウザ権限を確認）");
    }
  };

  useEffect(() => {
    (async () => {
      setError(null);
      setLoading(true);

      try {
        if (!roomId) return;

        // ログイン確認
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          router.replace("/login");
          return;
        }

        // ルーム取得（RLSでmemberのみ見える想定）
        const { data, error } = await supabase
          .from("rooms")
          .select("id,name,invite_code")
          .eq("id", roomId)
          .single();

        if (error) throw new Error(error.message);

        setRoom(data as Room);
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId, router]);

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="underline text-sm" href="/">
            ← 戻る
          </Link>
          <h1 className="text-2xl font-bold mt-2">{room?.name ?? "ルーム"}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="badge">Room ID: {roomId}</span>
          </div>
        </div>

        <button
          className="btn"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
        >
          ログアウト
        </button>
      </div>

      {error && (
        <div className="mt-4 card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}>
          <p className="text-sm">エラー：{error}</p>
        </div>
      )}

      {/* 招待ボックス */}
      <section className="mt-6 card">
        <h2 className="font-semibold">招待</h2>
        <p className="text-sm card-muted mt-1">
          URLを送るか、招待コードを送れば参加できます。
        </p>

        {!room?.invite_code ? (
          <p className="text-sm mt-3" style={{ color: "rgba(236,253,245,0.85)" }}>
            招待コードが見つかりません（rooms.invite_code を確認してね）
          </p>
        ) : (
          <>
            <div className="mt-4">
              <p className="text-xs card-muted">招待URL</p>
              <p className="text-sm font-mono mt-1 break-all">
                {`${window.location.origin}/join/${room.invite_code}`}
              </p>
              <button
                className="btn mt-2"
                onClick={() =>
                  copy(
                    `${window.location.origin}/join/${room.invite_code}`,
                    "招待URLをコピーしました！"
                  )
                }
              >
                URLコピー
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs card-muted">招待コード</p>
              <p className="text-sm font-mono mt-1">{room.invite_code}</p>
              <button
                className="btn mt-2"
                onClick={() => copy(room.invite_code!, "招待コードをコピーしました！")}
              >
                コードコピー
              </button>
            </div>
          </>
        )}
      </section>

      {/* ここに今後「出欠」「日程」「メンバー一覧」を載せていく */}
      <section className="mt-4 card">
        <h2 className="font-semibold">このルームでできること（今後）</h2>
        <ul className="mt-2 text-sm card-muted list-disc pl-5 space-y-1">
          <li>日程候補の追加・出欠</li>
          <li>メンバー一覧（Admin/Member）</li>
          <li>ゲスト追加（臨時参加者）</li>
        </ul>
      </section>
    </main>
  );
}
