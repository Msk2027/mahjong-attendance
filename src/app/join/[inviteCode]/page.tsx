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

  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRoom = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("rooms")
        .select("id,name")
        .eq("invite_code", inviteCode)
        .single();

      if (error) throw new Error(error.message);

      setRoomId(data.id);
      setRoomName(data.name);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async () => {
    setError(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      if (!roomId) throw new Error("Room not loaded");

      // display_name は profiles があればそれを使う
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      const dn = prof?.display_name ?? (user.email ?? "member").split("@")[0];

      // すでに参加済みなら無視できるように upsert 風にする
      const { error: memErr } = await supabase.from("room_members").insert({
        room_id: roomId,
        user_id: user.id,
        display_name: dn,
        role: "member",
      });

      // 参加済みで unique 制約エラーになったとしても、ルームに飛ばせばOK
      if (memErr && !memErr.message.toLowerCase().includes("duplicate")) {
        throw new Error(memErr.message);
      }

      router.replace(`/room/${roomId}`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">ルームに参加</h1>

      {error ? (
        <div className="mt-4 border rounded p-3 text-sm text-red-700 bg-red-50">
          エラー：{error}
        </div>
      ) : (
        <div className="mt-4 border rounded p-4">
          <p className="text-sm text-gray-600">参加先</p>
          <p className="text-lg font-semibold mt-1">{roomName}</p>

          <button
            className="bg-blue-600 text-white rounded px-4 py-2 mt-4 w-full"
            onClick={join}
          >
            参加する
          </button>
        </div>
      )}
    </main>
  );
}
