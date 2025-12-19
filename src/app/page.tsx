"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Room = {
  id: string;
  name: string;
  created_at: string;
};

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);

      if (!userData.user) {
        router.push("/login");
        return;
      }

      setEmail(userData.user.email ?? null);

      // profiles（無くてもOK）
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userData.user.id)
        .single();

      if (!profErr) setDisplayName(prof?.display_name ?? null);

      // 自分が所属しているルームだけ取得
      const { data, error } = await supabase
        .from("room_members")
        .select("rooms(id,name,created_at)")
        .eq("user_id", userData.user.id);

      if (error) throw new Error(error.message);

      const list: Room[] =
        (data ?? [])
          .map((row: any) => row.rooms)
          .filter(Boolean)
          .sort((a: Room, b: Room) => (a.created_at < b.created_at ? 1 : -1));

      setRooms(list);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    setError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const name = roomName.trim();
      if (!name) throw new Error("ルーム名を入力してください");

      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .insert({ name, created_by: user.id })
        .select("id,name,created_at")
        .single();

      if (roomErr) throw new Error(roomErr.message);

      const dn = displayName ?? (user.email ?? "owner").split("@")[0];

      const { error: memErr } = await supabase.from("room_members").insert({
        room_id: room.id,
        user_id: user.id,
        display_name: dn,
        role: "owner",
      });

      if (memErr) throw new Error(memErr.message);

      setRoomName("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    location.href = "/login";
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mahjong Attendance</h1>
          <p className="text-sm text-gray-600 mt-1">
            ログイン中：{displayName ?? "未設定"}（{email ?? "unknown"}）
          </p>
          <div className="mt-1">
            <Link className="underline text-sm" href="/settings">
              設定（ユーザー名変更）
            </Link>
          </div>
        </div>

        <button className="text-sm text-red-600" onClick={signOut}>
          ログアウト
        </button>
      </div>

      {error && (
        <div className="mt-4 border rounded p-3 text-sm text-red-700 bg-red-50">
          エラー：{error}
        </div>
      )}

      <section className="mt-6 border rounded-lg p-4">
        <h2 className="font-semibold">ルーム作成</h2>
        <div className="mt-3 flex gap-2">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="例）池袋卓 / サークル麻雀"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button
            className="bg-blue-600 text-white rounded px-4 py-2 whitespace-nowrap"
            onClick={createRoom}
          >
            作成
          </button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">参加中のルーム</h2>
        {rooms.length === 0 ? (
          <p className="text-gray-600 text-sm mt-2">まだルームがありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => (
              <li key={r.id} className="border rounded-lg p-3">
                <Link className="font-medium underline" href={`/room/${r.id}`}>
                  {r.name}
                </Link>
                <div className="text-xs text-gray-600 mt-1">{r.id}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
