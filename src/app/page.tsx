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

  const APP_NAME = "麻雀出欠ボード";

  const load = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      if (!sessData.session) {
        router.replace("/login");
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      setEmail(userData.user.email ?? null);

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userData.user.id)
        .single();

      setDisplayName(prof?.display_name ?? null);

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
      const msg = e?.message ?? "Unknown error";
      if (msg.includes("Auth session missing")) {
        router.replace("/login");
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange(() => load());
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    setError(null);

    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData.session) {
        router.replace("/login");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
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
    router.replace("/login");
  };

  if (loading) return <p className="py-10 text-center text-sm text-gray-600">Loading...</p>;

  return (
    <main className="space-y-6">
      {/* Header */}
      <header className="border bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
            <p className="text-sm text-gray-600 mt-1">
              ログイン中：<span className="font-medium text-gray-900">{displayName ?? "未設定"}</span>
              <span className="text-gray-500">（{email ?? "unknown"}）</span>
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <Link className="underline" href="/settings">
                設定（ユーザー名）
              </Link>
            </div>
          </div>

          <button className="text-sm border rounded-lg px-3 py-2" onClick={signOut}>
            ログアウト
          </button>
        </div>

        {error && (
          <div className="mt-4 border rounded-xl p-3 text-sm text-red-700 bg-red-50">
            エラー：{error}
          </div>
        )}
      </header>

      {/* Create Room */}
      <section className="border bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold">ルーム作成</h2>
        <p className="text-sm text-gray-600 mt-1">例：池袋卓 / サークル麻雀 / 研究室卓</p>

        <div className="mt-3 flex gap-2">
          <input
            className="border rounded-xl px-3 py-2 w-full"
            placeholder="ルーム名"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button className="border rounded-xl px-4 py-2 whitespace-nowrap" onClick={createRoom}>
            作成
          </button>
        </div>
      </section>

      {/* Rooms */}
      <section className="border bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold">参加中のルーム</h2>

        {rooms.length === 0 ? (
          <p className="text-sm text-gray-600 mt-2">まだルームがありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => (
              <li key={r.id} className="border rounded-xl p-4">
                <Link className="font-medium underline" href={`/room/${r.id}`}>
                  {r.name}
                </Link>
                <div className="text-xs text-gray-500 mt-1">ID: {r.id}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
