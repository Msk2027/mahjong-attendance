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

type Me = {
  id: string;
  email: string | null;
};

type Member = {
  user_id: string;
  display_name: string;
  role: string; // owner/admin/member など
};

type Candidate = {
  id: string;
  date: string; // yyyy-mm-dd
  min_players: number;
  created_at: string;
  created_by: string;
};

type Rsvp = {
  candidate_id: string;
  user_id: string;
  status: "yes" | "maybe" | "no";
  updated_at: string;
};

type Guest = {
  id: string;
  room_id: string;
  name: string;
  note: string | null;
  added_by: string | null;
  created_by?: string | null;
  created_at: string;
  display_name?: string | null;
};

const statusLabel: Record<Rsvp["status"], string> = {
  yes: "◯",
  maybe: "△",
  no: "×",
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
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  // members
  const [members, setMembers] = useState<Member[]>([]);

  // schedule candidates
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newMin, setNewMin] = useState<number>(4);

  // rsvps
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);

  // guests
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestNote, setGuestNote] = useState("");

  const copy = async (text: string, doneMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(doneMsg);
    } catch {
      alert("コピーに失敗しました（ブラウザ権限を確認）");
    }
  };

  const loadAll = async () => {
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

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      setMe({ id: userData.user.id, email: userData.user.email ?? null });

      // ルーム取得
      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("id,name,invite_code")
        .eq("id", roomId)
        .single();
      if (roomErr) throw new Error(roomErr.message);
      setRoom(roomData as Room);

      // メンバー一覧
      const { data: memData, error: memErr } = await supabase
        .from("room_members")
        .select("user_id,display_name,role")
        .eq("room_id", roomId);
      if (memErr) throw new Error(memErr.message);

      const memList: Member[] = (memData ?? []).map((m: any) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        role: m.role,
      }));
      setMembers(memList);

      // 日程候補
      const { data: candData, error: candErr } = await supabase
        .from("schedule_candidates")
        .select("id,date,min_players,created_at,created_by")
        .eq("room_id", roomId)
        .order("date", { ascending: true });
      if (candErr) throw new Error(candErr.message);

      const candList: Candidate[] = (candData ?? []).map((c: any) => ({
        id: c.id,
        date: c.date,
        min_players: c.min_players,
        created_at: c.created_at,
        created_by: c.created_by,
      }));
      setCandidates(candList);

      // 出欠
      const { data: rsvpData, error: rsvpErr } = await supabase
        .from("rsvps")
        .select("candidate_id,user_id,status,updated_at")
        .eq("room_id", roomId);
      if (rsvpErr) throw new Error(rsvpErr.message);

      const rsvpList: Rsvp[] = (rsvpData ?? []).map((r: any) => ({
        candidate_id: r.candidate_id,
        user_id: r.user_id,
        status: r.status,
        updated_at: r.updated_at,
      }));
      setRsvps(rsvpList);

      // ゲスト（display_name / created_by も取っておく）
      const { data: guestData, error: guestErr } = await supabase
        .from("room_guests")
        .select("id,room_id,name,display_name,note,added_by,created_by,created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (guestErr) throw new Error(guestErr.message);

      const guestList: Guest[] = (guestData ?? []).map((g: any) => ({
        id: g.id,
        room_id: g.room_id,
        name: g.name,
        display_name: g.display_name ?? null,
        note: g.note ?? null,
        added_by: g.added_by ?? null,
        created_by: g.created_by ?? null,
        created_at: g.created_at,
      }));
      setGuests(guestList);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const addCandidate = async () => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");
      const d = newDate.trim();
      if (!d) throw new Error("日付を選んでください");

      const min = Number(newMin);
      if (!Number.isFinite(min) || min < 2 || min > 20) {
        throw new Error("最低人数は 2〜20 の範囲で入力してください");
      }

      const { error } = await supabase.from("schedule_candidates").insert({
        room_id: roomId,
        date: d,
        min_players: min,
        created_by: me.id,
      });

      if (error) throw new Error(error.message);

      setNewDate("");
      setNewMin(4);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const setMyRsvp = async (candidateId: string, status: Rsvp["status"]) => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");

      const { error } = await supabase.from("rsvps").upsert(
        {
          room_id: roomId,
          candidate_id: candidateId,
          user_id: me.id,
          status,
        },
        { onConflict: "candidate_id,user_id" }
      );

      if (error) throw new Error(error.message);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // ✅ display_name / created_by NOT NULL 対応版
  const addGuest = async () => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");

      const name = guestName.trim();
      const note = guestNote.trim();

      if (!name) throw new Error("ゲスト名を入力してください");
      if (name.length > 40) throw new Error("ゲスト名が長すぎます（40文字以内）");
      if (note.length > 60) throw new Error("メモが長すぎます（60文字以内）");

      const { error } = await supabase.from("room_guests").insert({
        room_id: roomId,
        name,
        display_name: name, // NOT NULL
        note: note ? note : null,
        created_by: me.id,  // NOT NULL
        added_by: me.id,    // 任意（履歴用）
      });

      if (error) throw new Error(error.message);

      setGuestName("");
      setGuestNote("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const deleteGuest = async (guestId: string) => {
    setError(null);
    try {
      const { error } = await supabase.from("room_guests").delete().eq("id", guestId);
      if (error) throw new Error(error.message);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const summaryFor = (candidateId: string, minPlayers: number) => {
    const list = rsvps.filter((r) => r.candidate_id === candidateId);
    const yes = list.filter((r) => r.status === "yes").length;
    const maybe = list.filter((r) => r.status === "maybe").length;
    const no = list.filter((r) => r.status === "no").length;
    const confirmed = yes >= minPlayers;
    return { yes, maybe, no, confirmed };
  };

  const myStatusFor = (candidateId: string) => {
    if (!me) return null;
    return rsvps.find((r) => r.candidate_id === candidateId && r.user_id === me.id)?.status ?? null;
  };

  const nameOfUserId = (userId: string | null) => {
    if (!userId) return "unknown";
    return members.find((m) => m.user_id === userId)?.display_name ?? "unknown";
  };

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
        <div
          className="mt-4 card"
          style={{
            borderColor: "rgba(239, 68, 68, 0.35)",
            background: "rgba(127, 29, 29, 0.25)",
          }}
        >
          <p className="text-sm">エラー：{error}</p>
        </div>
      )}

      {/* =========================================================
          ① 日程候補
         ========================================================= */}
      <section className="mt-6 card">
        <h2 className="font-semibold">日程候補</h2>
        <p className="text-sm card-muted mt-1">候補日を追加して、各自が ◯/△/× を入れます。</p>

        <div className="mt-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs card-muted">日付</label>
            <input className="input mt-1" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>

          <div className="w-[160px]">
            <label className="text-xs card-muted">最低人数</label>
            <input
              className="input mt-1"
              type="number"
              min={2}
              max={20}
              value={newMin}
              onChange={(e) => setNewMin(Number(e.target.value))}
            />
          </div>

          <button className="btn btn-primary" onClick={addCandidate}>
            追加
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm card-muted mt-3">まだ候補がありません。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {candidates.map((c) => {
              const sum = summaryFor(c.id, c.min_players);
              const my = myStatusFor(c.id);

              return (
                <div key={c.id} className="card" style={{ padding: 14 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-semibold">{c.date}</span>
                        {sum.confirmed ? <span className="badge">開催ライン到達</span> : <span className="badge">調整中</span>}
                        <span className="badge">最低 {c.min_players} 人</span>
                      </div>
                      <p className="text-xs card-muted mt-1">
                        集計：◯ {sum.yes} / △ {sum.maybe} / × {sum.no}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="btn"
                        onClick={() => setMyRsvp(c.id, "yes")}
                        style={my === "yes" ? { background: "rgba(6, 78, 59, 0.35)" } : undefined}
                      >
                        ◯
                      </button>
                      <button
                        className="btn"
                        onClick={() => setMyRsvp(c.id, "maybe")}
                        style={my === "maybe" ? { background: "rgba(6, 78, 59, 0.35)" } : undefined}
                      >
                        △
                      </button>
                      <button
                        className="btn"
                        onClick={() => setMyRsvp(c.id, "no")}
                        style={my === "no" ? { background: "rgba(6, 78, 59, 0.35)" } : undefined}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs card-muted">出欠（メンバー）</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {members.map((m) => {
                        const s =
                          rsvps.find((r) => r.candidate_id === c.id && r.user_id === m.user_id)?.status ?? null;
                        return (
                          <span key={m.user_id} className="badge">
                            {m.display_name}：{s ? statusLabel[s] : "—"}
                          </span>
                        );
                      })}
                    </div>

                    {guests.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-xs card-muted">ゲスト（出欠なし）</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {guests.map((g) => (
                            <span key={g.id} className="badge">
                              {g.name}
                              {g.note ? `（${g.note}）` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =========================================================
          ② メンバー
         ========================================================= */}
      <section className="mt-4 card">
        <h2 className="font-semibold">メンバー一覧</h2>
        {members.length === 0 ? (
          <p className="text-sm card-muted mt-2">メンバーが見つかりません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="badge">{m.role}</span>
                  <span className="text-sm">{m.display_name}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ゲスト */}
      <section className="mt-4 card">
        <h2 className="font-semibold">ゲスト参加者</h2>
        <p className="text-sm card-muted mt-1">臨時で呼ぶ人がいる場合に追加して共有できます。</p>

        <div className="mt-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs card-muted">ゲスト名</label>
            <input
              className="input mt-1"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="例）たけし / 友人A"
            />
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="text-xs card-muted">メモ（任意）</label>
            <input
              className="input mt-1"
              value={guestNote}
              onChange={(e) => setGuestNote(e.target.value)}
              placeholder="例）20時以降なら来れる"
            />
          </div>

          <button className="btn btn-primary" onClick={addGuest}>
            追加
          </button>
        </div>

        {guests.length === 0 ? (
          <p className="text-sm card-muted mt-3">まだゲストがいません。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {guests.map((g) => (
              <li key={g.id} className="card" style={{ padding: 14 }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{g.name}</span>
                      {g.note ? <span className="badge">{g.note}</span> : null}
                    </div>
                    <p className="text-xs card-muted mt-2">追加者：{nameOfUserId(g.added_by)}</p>
                  </div>

                  {me?.id && (g.added_by === me.id || g.created_by === me.id) ? (
                    <button className="btn" onClick={() => deleteGuest(g.id)}>
                      削除
                    </button>
                  ) : (
                    <span className="text-xs card-muted">（削除不可）</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* =========================================================
          ③ 招待
         ========================================================= */}
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
              <p className="text-sm font-mono mt-1 break-all">
                {`${window.location.origin}/join/${room.invite_code}`}
              </p>
              <button
                className="btn mt-2"
                onClick={() =>
                  copy(`${window.location.origin}/join/${room.invite_code}`, "招待URLをコピーしました！")
                }
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
    </main>
  );
}
