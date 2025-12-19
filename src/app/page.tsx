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

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setError(userErr.message);
      return;
    }
    if (!userData.user) {
      router.push("/login");
      return;
    }

    setEmail(userData.user.email ?? null);

    // ✅ profiles からユーザー名を取得
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userData.user.id)
      .single();

    // profilesがまだ無いユーザーでも落ちないようにする
    if (profErr) {
      setDisplayName(null);
    } else {
      setDisplayName(prof?.display_name ?? null);
    }

    // 自分が所属しているルームだけ取得
    const { data, error } = await supabase
      .from("room_members")
      .select("rooms(id,name,created_at)")
      .eq("user_id", userData.user.id);

    if (error) {
      setError(error.message);
      return;
    }

    const list: Room[] =
      (data ?? [])
        .map((row: any) => row.rooms)
        .filter(Boolean)
        .sort((a: Room, b: Room) => (a.created_at < b.created_at ? 1 : -1));

    setRooms(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      router.push("/login");
      return;
    }

    const name = roomName.trim();
    if (!name) {
      setError("ルーム名を入力してください");
      return;
    }

    // rooms を作成
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .insert({ name, created_by: user.id })
      .select("id,name,created_at")
      .single();

    if (roomErr) {
      setError(roomErr.message);
      return;
    }

    // ✅ room_members.display_name に profiles のユーザー名を使う（無ければメールの@前）
    const dn = displayName ?? (user.email ?? "owner").split("@")[0];

    const { error: memErr } = await supabase.from("room_members").insert({
      room_id: room.id,
      user_id: user.id,
      display_name: dn,
      role: "owner",
    });

    if (memErr) {
      setError(memErr.message);
      return;
    }

    setRoomName("");
    await load();
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

          {/* ✅ ユーザー名を表示 */}
          <p className="text-sm text-gray-600 mt-1">
            ログイン中：{displayName ?? "未設定"}（{email}）
          </p>

          {/* ✅ 設定ページへのリンク */}
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
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
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
