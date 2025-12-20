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

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userData.user.id)
        .single();

      setDisplayName(prof?.display_name ?? null);

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

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました！");
    } catch {
      alert("コピーに失敗しました（ブラウザの権限を確認）");
    }
  };

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

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">麻雀出欠ボード</h1>
          <p className="text-sm card-muted mt-1">
            ログイン中：{displayName ?? "未設定"}（{email ?? "unknown"}）
          </p>
          <div className="mt-1 flex gap-3 flex-wrap">
            <Link className="underline text-sm" href="/settings">
              設定（ユーザー名変更）
            </Link>
            <Link className="underline text-sm" href="/settings">
              メール/パスワード変更
            </Link>
          </div>
        </div>

        <button className="btn" onClick={signOut}>
          ログアウト
        </button>
      </div>

      {error && (
        <div className="mt-4 card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}>
          <p className="text-sm">エラー：{error}</p>
        </div>
      )}

      {/* ===== 参加中のルーム（最優先で上） ===== */}
      <section className="mt-6 card">
        <h2 className="font-semibold">参加中のルーム</h2>

        {rooms.length === 0 ? (
          <p className="card-muted text-sm mt-2">まだルームがありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((r) => (
              <li key={r.id} className="card" style={{ padding: 14 }}>
                <Link className="font-semibold underline" href={`/room/${r.id}`}>
                  {r.name}
                </Link>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.invite_code ? (
                    <>
                      <span className="badge">招待コード：{r.invite_code}</span>
                      <button className="btn" onClick={() => copy(`${location.origin}/join/${r.invite_code}`)}>
                        招待URLコピー
                      </button>
                    </>
                  ) : (
                    <span className="badge">（招待コード未設定）</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== ルーム作成 ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">ルーム作成</h2>

        {/* スマホは縦並び / PCは横並び */}
        <div className="mt-3 flex gap-2 flex-col sm:flex-row">
          <input
            className="input"
            placeholder="例）池袋卓 / サークル麻雀"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button className="btn btn-primary w-full sm:w-auto" onClick={createRoom}>
            作成
          </button>
        </div>

        {/* 作成直後の招待情報 */}
        {lastInvite && (
          <div className="mt-4 card" style={{ padding: 14 }}>
            <p className="text-sm font-semibold">招待リンク</p>
            <p className="text-xs card-muted mt-1 break-all">{lastInvite.url}</p>
            <div className="mt-2 flex gap-2 flex-col sm:flex-row">
              <button className="btn w-full sm:w-auto" onClick={() => copy(lastInvite.url)}>
                URLをコピー
              </button>
              <button className="btn w-full sm:w-auto" onClick={() => copy(lastInvite.code)}>
                招待コードをコピー
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ===== ルーム参加（招待コード） ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">ルームに参加</h2>
        <p className="text-sm card-muted mt-1">招待コードを入力して参加できます</p>

        <div className="mt-3 flex gap-2 flex-col sm:flex-row">
          <input
            className="input"
            placeholder="招待コード（例：a1b2c3d4...）"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button className="btn w-full sm:w-auto" onClick={goJoin}>
            参加
          </button>
        </div>
      </section>
    </main>
  );
}
