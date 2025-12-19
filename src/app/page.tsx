"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Room = {
  id: string;
  name: string;
  created_at: string;
  invite_code?: string | null;
};

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  // 招待情報表示用
  const [lastInvite, setLastInvite] = useState<{ code: string; url: string } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (userErr?.message?.includes("Auth session missing")) {
        router.push("/login");
        return;
      }
      if (userErr) throw new Error(userErr.message);

      if (!userData.user) {
        router.push("/login");
        return;
      }

      setEmail(userData.user.email ?? null);

      // profiles（無くてもOK）
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userData.user.id)
        .single();

      setDisplayName(prof?.display_name ?? null);

      // 自分が所属しているルームだけ取得
      // rooms の invite_code も取る（招待表示のため）
      const { data, error } = await supabase
        .from("room_members")
        .select("rooms(id,name,created_at,invite_code)")
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

    const { data } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    setError(null);
    setLastInvite(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (userErr?.message?.includes("Auth session missing")) {
        router.push("/login");
        return;
      }
      if (userErr) throw new Error(userErr.message);

      const user = userData.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const name = roomName.trim();
      if (!name) throw new Error("ルーム名を入力してください");

      // invite_code も一緒に受け取る
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .insert({ name, created_by: user.id })
        .select("id,name,created_at,invite_code")
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

      const code = (room as any).invite_code as string | null | undefined;
      if (code) {
        const url = `${location.origin}/join/${code}`;
        setLastInvite({ code, url });
      } else {
        setLastInvite(null);
      }

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const goJoin = () => {
    const code = inviteCode.trim();
    if (!code) return;
    router.push(`/join/${code}`);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました！");
    } catch {
      alert("コピーに失敗しました（ブラウザの権限を確認）");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">麻雀出欠ボード</h1>
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

      {/* ルーム作成 */}
      <section className="mt-6 border rounded-lg p-4 bg-white">
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

        {/* 作成直後の招待情報 */}
        {lastInvite && (
          <div className="mt-4 border rounded p-3 bg-gray-50">
            <p className="text-sm font-medium">招待リンク</p>
            <p className="text-xs text-gray-600 mt-1 break-all">{lastInvite.url}</p>
            <div className="mt-2 flex gap-2">
              <button className="border rounded px-3 py-2 text-sm" onClick={() => copy(lastInvite.url)}>
                URLをコピー
              </button>
              <button className="border rounded px-3 py-2 text-sm" onClick={() => copy(lastInvite.code)}>
                招待コードをコピー
              </button>
            </div>
          </div>
        )}

        {/* 招待コードが返ってこない場合のヒント */}
        {!lastInvite && (
          <p className="text-xs text-gray-600 mt-3">
            ※ 招待コードが表示されない場合、DB側で invite_code の自動生成設定が必要です。
          </p>
        )}
      </section>

      {/* ルーム参加（招待コード） */}
      <section className="mt-4 border rounded-lg p-4 bg-white">
        <h2 className="font-semibold">ルームに参加</h2>
        <p className="text-sm text-gray-600 mt-1">招待コードを入力して参加できます</p>

        <div className="mt-3 flex gap-2">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="招待コード（例：a1b2c3d4...）"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button className="border rounded px-4 py-2 whitespace-nowrap" onClick={goJoin}>
            参加
          </button>
        </div>
      </section>

      {/* 参加中のルーム */}
      <section className="mt-6">
        <h2 className="font-semibold">参加中のルーム</h2>

        {rooms.length === 0 ? (
          <p className="text-gray-600 text-sm mt-2">まだルームがありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => (
              <li key={r.id} className="border rounded-lg p-3 bg-white">
                <Link className="font-medium underline" href={`/room/${r.id}`}>
                  {r.name}
                </Link>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.invite_code ? (
                    <>
                      <span className="text-xs text-gray-600">招待コード：</span>
                      <span className="text-xs font-mono">{r.invite_code}</span>
                      <button
                        className="border rounded px-2 py-1 text-xs"
                        onClick={() => copy(`${location.origin}/join/${r.invite_code}`)}
                      >
                        招待URLコピー
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-600">（招待コード未設定）</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
