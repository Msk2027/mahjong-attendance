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

type Me = { id: string; email: string | null };

type Member = {
  user_id: string;
  display_name: string;
  role: string; // owner/admin/member
};

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const myRole = useMemo(() => {
    if (!me) return null;
    return members.find((m) => m.user_id === me.id)?.role ?? null;
  }, [me, members]);

  const isOwner = myRole === "owner";

  const load = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!roomId) return;

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      setMe({ id: userData.user.id, email: userData.user.email ?? null });

      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("id,name,invite_code")
        .eq("id", roomId)
        .single();
      if (roomErr) throw new Error(roomErr.message);
      setRoom(roomData as Room);

      const { data: memData, error: memErr } = await supabase
        .from("room_members")
        .select("user_id,display_name,role")
        .eq("room_id", roomId);
      if (memErr) throw new Error(memErr.message);
      setMembers(
        (memData ?? []).map((m: any) => ({
          user_id: m.user_id,
          display_name: m.display_name,
          role: m.role,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const copy = async (text: string, doneMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(doneMsg);
    } catch {
      alert("コピーに失敗しました（ブラウザ権限を確認）");
    }
  };

  // ✅ ownerのみ：メンバーのロール変更（admin付与/解除 / DB側でもガード済）
  const setMemberRole = async (userId: string, nextRole: "admin" | "member") => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ロール変更はownerのみ実行できます");

      const { error } = await supabase.rpc("set_member_role", {
        p_room_id: roomId,
        p_user_id: userId,
        p_role: nextRole,
      });
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // 退会させられるか（owner→admin/member、admin→memberのみ、自分・ownerは不可）
  const canRemove = (m: Member) => {
    if (!me) return false;
    if (m.user_id === me.id) return false;
    if (m.role === "owner") return false;
    if (myRole === "owner") return m.role === "admin" || m.role === "member";
    if (myRole === "admin") return m.role === "member";
    return false;
  };

  // メンバーをルームから強制退会（権限はDB側でもガード済）
  const removeMember = async (m: Member) => {
    setError(null);
    try {
      if (!canRemove(m)) throw new Error("このメンバーを退会させる権限がありません");
      if (!confirm(`「${m.display_name}」をルームから退会させます。よろしいですか？\n（このルームでの出欠も削除されます）`)) return;

      const { error } = await supabase.rpc("remove_room_member", {
        p_room_id: roomId,
        p_user_id: m.user_id,
      });
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // 自分でルームを退出（ownerは不可。ルーム削除を使う）
  const leaveRoom = async () => {
    setError(null);
    try {
      if (isOwner) throw new Error("オーナーは退出できません。ルームを削除してください。");
      if (!confirm(`ルーム「${room?.name ?? ""}」を退出します。よろしいですか？\n（このルームでのあなたの出欠データも削除されます）`)) return;

      const { error } = await supabase.rpc("leave_room", {
        p_room_id: roomId,
      });
      if (error) throw new Error(error.message);

      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // ✅ ownerのみ：ルーム削除（RPC / DB側でもガード済）
  const deleteRoom = async () => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (
        !confirm(
          `ルーム「${room?.name ?? ""}」を削除します。よろしいですか？\n（日程・出欠・ゲスト・メンバーなど、このルームの全データが消えます）`
        )
      )
        return;

      const { error } = await supabase.rpc("delete_room", {
        p_room_id: roomId,
      });
      if (error) throw new Error(error.message);

      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div>
        <Link className="btn" href={`/room/${roomId}`}>
          ← ルームへ戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">{room?.name ?? "ルーム"}</h1>
      </div>

      {error && (
        <div
          className="mt-4 card"
          style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}
        >
          <p className="text-sm">エラー：{error}</p>
        </div>
      )}

      {/* ===== メンバー ===== */}
      <section className="mt-6 card">
        <h2 className="font-semibold">メンバー一覧</h2>
        {members.length === 0 ? (
          <p className="text-sm card-muted mt-2">メンバーが見つかりません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li key={m.user_id}>
                <button
                  type="button"
                  onClick={() => setSelectedMemberId(m.user_id)}
                  className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-white/5 active:bg-white/10"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="badge shrink-0">{m.role}</span>
                    <span className="text-sm truncate">
                      {m.display_name}
                      {m.user_id === me?.id ? "（あなた）" : ""}
                    </span>
                  </span>
                  <span className="card-muted text-sm shrink-0">詳細 ›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== 招待 ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">招待</h2>
        <p className="text-sm card-muted mt-1">URLを送るか、招待コードを送れば参加できます。</p>

        {!room?.invite_code ? (
          <p className="text-sm mt-3" style={{ color: "rgba(236,253,245,0.85)" }}>
            招待コードが見つかりません（rooms.invite_code を確認してね）
          </p>
        ) : (
          <>
            <div className="mt-4">
              <p className="text-xs card-muted">招待URL</p>
              <p className="text-sm font-mono mt-1 break-all">{`${window.location.origin}/join/${room.invite_code}`}</p>
              <button
                className="btn mt-2"
                onClick={() => copy(`${window.location.origin}/join/${room.invite_code}`, "招待URLをコピーしました！")}
              >
                URLコピー
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs card-muted">招待コード</p>
              <p className="text-sm font-mono mt-1">{room.invite_code}</p>
              <button className="btn mt-2" onClick={() => copy(room.invite_code!, "招待コードをコピーしました！")}>
                コードコピー
              </button>
            </div>
          </>
        )}
      </section>

      {/* ===== ルーム退出（owner以外） ===== */}
      {myRole && myRole !== "owner" && (
        <section
          className="mt-4 card"
          style={{ borderColor: "rgba(239, 68, 68, 0.35)" }}
        >
          <h2 className="font-semibold">ルームを退出</h2>
          <p className="text-sm card-muted mt-1">
            このルームから抜けます。このルームでのあなたの出欠データも削除されます。
          </p>
          <button
            className="btn mt-3"
            style={{ borderColor: "rgba(239, 68, 68, 0.5)", color: "rgb(248, 113, 113)" }}
            onClick={leaveRoom}
          >
            ルームを退出する
          </button>
        </section>
      )}

      {/* ===== ルーム削除（ownerのみ） ===== */}
      {isOwner && (
        <section
          className="mt-4 card"
          style={{ borderColor: "rgba(239, 68, 68, 0.35)" }}
        >
          <h2 className="font-semibold">ルーム削除</h2>
          <p className="text-sm card-muted mt-1">
            このルームと、日程・出欠・ゲスト・メンバーなどの全データを削除します。元に戻せません。
          </p>
          <button
            className="btn mt-3"
            style={{ borderColor: "rgba(239, 68, 68, 0.5)", color: "rgb(248, 113, 113)" }}
            onClick={deleteRoom}
          >
            ルームを削除する
          </button>
        </section>
      )}

      {/* ===== メンバー詳細モーダル ===== */}
      {(() => {
        const sel = selectedMemberId
          ? members.find((m) => m.user_id === selectedMemberId) ?? null
          : null;
        if (!sel) return null;

        const canToggleRole = isOwner && sel.role !== "owner" && sel.user_id !== me?.id;
        const showRemove = canRemove(sel);

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50"
            onClick={() => setSelectedMemberId(null)}
          >
            <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold truncate">
                    {sel.display_name}
                    {sel.user_id === me?.id ? "（あなた）" : ""}
                  </h3>
                  <div className="mt-1">
                    <span className="badge">{sel.role}</span>
                  </div>
                </div>
                <button className="btn shrink-0" onClick={() => setSelectedMemberId(null)}>
                  閉じる
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {canToggleRole ? (
                  sel.role === "admin" ? (
                    <button className="btn" onClick={() => setMemberRole(sel.user_id, "member")}>
                      管理者を解除する
                    </button>
                  ) : (
                    <button className="btn" onClick={() => setMemberRole(sel.user_id, "admin")}>
                      管理者にする
                    </button>
                  )
                ) : null}

                {showRemove ? (
                  <button
                    className="btn"
                    style={{ borderColor: "rgba(239, 68, 68, 0.5)", color: "rgb(248, 113, 113)" }}
                    onClick={() => removeMember(sel)}
                  >
                    ルームから退会させる
                  </button>
                ) : null}

                {!canToggleRole && !showRemove ? (
                  <p className="card-muted text-sm">このメンバーに対してできる操作はありません。</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
