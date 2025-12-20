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
  role: string; // owner/member
};

type Candidate = {
  id: string;
  room_id: string;
  date: string; // yyyy-mm-dd
  min_players: number;
  created_by: string;
  created_at: string;
  is_confirmed: boolean;
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
  candidate_id: string | null;
  name: string;
  note: string | null;
  created_by: string | null;
  added_by: string | null;
  created_at: string;
};

type Event = {
  id: string;
  room_id: string;
  candidate_id: string;
  date: string; // yyyy-mm-dd
  min_players: number;
  start_time: string | null; // "HH:MM:SS"
  note: string | null;
  confirmed_at: string;
};

const statusLabel: Record<Rsvp["status"], string> = {
  yes: "◯",
  maybe: "△",
  no: "×",
};

const ymdToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const hhmm = (t: string | null) => {
  if (!t) return "";
  // "HH:MM:SS" -> "HH:MM"
  return t.slice(0, 5);
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

  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // candidate追加
  const [newDate, setNewDate] = useState("");
  const [newMinPlayers, setNewMinPlayers] = useState<number>(4);

  // guest追加（候補日に紐づけ）
  const [guestCandidateId, setGuestCandidateId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestNote, setGuestNote] = useState("");

  const myRole = useMemo(() => {
    if (!me) return null;
    return members.find((m) => m.user_id === me.id)?.role ?? null;
  }, [me, members]);

  const isOwner = myRole === "owner";

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

      // セッション確認
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      // user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      setMe({ id: userData.user.id, email: userData.user.email ?? null });

      // room
      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("id,name,invite_code")
        .eq("id", roomId)
        .single();
      if (roomErr) throw new Error(roomErr.message);
      setRoom(roomData as Room);

      // members
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

      // candidates
      const { data: candData, error: candErr } = await supabase
        .from("schedule_candidates")
        .select("id,room_id,date,min_players,created_by,created_at,is_confirmed")
        .eq("room_id", roomId)
        .order("date", { ascending: true });
      if (candErr) throw new Error(candErr.message);

      const candList: Candidate[] = (candData ?? []).map((c: any) => ({
        id: c.id,
        room_id: c.room_id,
        date: c.date,
        min_players: c.min_players,
        created_by: c.created_by,
        created_at: c.created_at,
        is_confirmed: c.is_confirmed,
      }));
      setCandidates(candList);

      // ゲストの候補日セレクト初期値
      if (!guestCandidateId) {
        const firstActive = candList.find((c) => !c.is_confirmed);
        if (firstActive) setGuestCandidateId(firstActive.id);
      }

      // rsvps
      const { data: rsvpData, error: rsvpErr } = await supabase
        .from("rsvps")
        .select("candidate_id,user_id,status,updated_at")
        .eq("room_id", roomId);
      if (rsvpErr) throw new Error(rsvpErr.message);

      setRsvps(
        (rsvpData ?? []).map((r: any) => ({
          candidate_id: r.candidate_id,
          user_id: r.user_id,
          status: r.status,
          updated_at: r.updated_at,
        }))
      );

      // guests
      const { data: guestData, error: guestErr } = await supabase
        .from("room_guests")
        .select("id,room_id,candidate_id,name,note,created_by,added_by,created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (guestErr) throw new Error(guestErr.message);

      setGuests(
        (guestData ?? []).map((g: any) => ({
          id: g.id,
          room_id: g.room_id,
          candidate_id: g.candidate_id ?? null,
          name: g.name,
          note: g.note ?? null,
          created_by: g.created_by ?? null,
          added_by: g.added_by ?? null,
          created_at: g.created_at,
        }))
      );

      // confirmed events
      const { data: evData, error: evErr } = await supabase
        .from("events")
        .select("id,room_id,candidate_id,date,min_players,start_time,note,confirmed_at")
        .eq("room_id", roomId)
        .order("date", { ascending: true });
      if (evErr) throw new Error(evErr.message);

      setEvents(
        (evData ?? []).map((e: any) => ({
          id: e.id,
          room_id: e.room_id,
          candidate_id: e.candidate_id,
          date: e.date,
          min_players: e.min_players,
          start_time: e.start_time ?? null,
          note: e.note ?? null,
          confirmed_at: e.confirmed_at,
        }))
      );
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

  // ===== helpers =====
  const activeCandidates = useMemo(() => candidates.filter((c) => !c.is_confirmed), [candidates]);

  const guestsFor = (candidateId: string) => guests.filter((g) => g.candidate_id === candidateId);

  const summaryFor = (candidateId: string, minPlayers: number) => {
    const list = rsvps.filter((r) => r.candidate_id === candidateId);
    const yesMembers = list.filter((r) => r.status === "yes").length;
    const maybe = list.filter((r) => r.status === "maybe").length;
    const no = list.filter((r) => r.status === "no").length;

    const guestCount = guestsFor(candidateId).length;
    const yes = yesMembers + guestCount; // ゲストは確定参加として◯に加算
    const confirmed = yes >= minPlayers;

    return { yes, yesMembers, guestCount, maybe, no, confirmed };
  };

  const myStatusFor = (candidateId: string) => {
    if (!me) return null;
    return rsvps.find((r) => r.candidate_id === candidateId && r.user_id === me.id)?.status ?? null;
  };

  const today = useMemo(() => ymdToday(), []);
  const upcomingEvents = useMemo(() => events.filter((e) => e.date >= today), [events, today]);
  const pastEvents = useMemo(() => events.filter((e) => e.date < today), [events, today]);

  // ===== actions =====
  const addCandidate = async () => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");
      const d = newDate.trim();
      if (!d) throw new Error("日付を選んでください");

      const min = Number(newMinPlayers);
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
      setNewMinPlayers(4);
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
        { room_id: roomId, candidate_id: candidateId, user_id: me.id, status },
        { onConflict: "candidate_id,user_id" }
      );
      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const addGuest = async () => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");
      if (activeCandidates.length === 0) throw new Error("先に日程候補を追加してください");

      const cid = guestCandidateId.trim();
      if (!cid) throw new Error("ゲストの参加日を選んでください");

      const name = guestName.trim();
      const note = guestNote.trim();
      if (!name) throw new Error("ゲスト名を入力してください");

      const { error } = await supabase.from("room_guests").insert({
        room_id: roomId,
        candidate_id: cid,
        name,
        display_name: name, // NOT NULL 対策（あなたのDBに合わせて入れる）
        note: note ? note : null,
        created_by: me.id, // NOT NULL
        added_by: me.id,
      });
      if (error) throw new Error(error.message);

      setGuestName("");
      setGuestNote("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // 開催確定（ownerのみ / DB側でもガード済）
  const confirmCandidate = async (candidateId: string) => {
    setError(null);
    try {
      const { data, error } = await supabase.rpc("confirm_event", {
        p_candidate_id: candidateId,
      });
      if (error) throw new Error(error.message);

      const eventId = data as string;
      router.push(`/event/${eventId}`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // ✅ ownerのみ：開催候補削除（RPC）
  const deleteCandidate = async (candidateId: string) => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (!confirm("この日程候補を削除します。よろしいですか？（出欠・ゲストも消えます）")) return;

      const { error } = await supabase.rpc("delete_schedule_candidate", {
        p_candidate_id: candidateId,
      });
      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // ✅ ownerのみ：開催確定削除（＝確定解除 / RPC）
  const deleteEvent = async (eventId: string) => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (!confirm("この開催確定を取り消します。よろしいですか？（イベント削除）")) return;

      const { error } = await supabase.rpc("delete_event", {
        p_event_id: eventId,
      });
      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
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
            {myRole ? <span className="badge">あなた：{myRole}</span> : null}
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

      {/* ===== ① 日程候補 ===== */}
      <section className="mt-6 card">
        <h2 className="font-semibold">日程候補</h2>
        <p className="text-sm card-muted mt-1">
          候補日を追加して、各自が ◯/△/× を入れます（ゲストは◯に加算）。
        </p>

        {/* 候補追加 */}
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
              value={newMinPlayers}
              onChange={(e) => setNewMinPlayers(Number(e.target.value))}
            />
          </div>

          <button className="btn btn-primary" onClick={addCandidate}>
            追加
          </button>
        </div>

        {/* 候補一覧 */}
        {activeCandidates.length === 0 ? (
          <p className="text-sm card-muted mt-3">候補がありません。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {activeCandidates.map((c) => {
              const sum = summaryFor(c.id, c.min_players);
              const my = myStatusFor(c.id);
              const gList = guestsFor(c.id);

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
                        集計：◯ {sum.yes}（メンバー {sum.yesMembers} + ゲスト {sum.guestCount}） / △ {sum.maybe} / ×{" "}
                        {sum.no}
                      </p>
                    </div>

                    <div className="flex gap-2 items-center flex-wrap justify-end">
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

                      {/* ownerだけ + 開催ライン到達で「開催確定」 */}
                      {isOwner && sum.confirmed ? (
                        <button className="btn btn-primary" onClick={() => confirmCandidate(c.id)}>
                          開催確定
                        </button>
                      ) : null}

                      {/* ✅ ownerのみ：候補削除 */}
                      {isOwner ? (
                        <button
                          className="btn"
                          onClick={() => deleteCandidate(c.id)}
                          style={{ borderColor: "rgba(239, 68, 68, 0.45)" }}
                        >
                          候補削除
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* メンバー出欠 */}
                  <div className="mt-3">
                    <p className="text-xs card-muted">出欠（メンバー）</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {members.map((m) => {
                        const s = rsvps.find((r) => r.candidate_id === c.id && r.user_id === m.user_id)?.status ?? null;
                        return (
                          <span key={m.user_id} className="badge">
                            {m.display_name}：{s ? statusLabel[s as Rsvp["status"]] : "—"}
                          </span>
                        );
                      })}
                    </div>

                    {/* ゲスト */}
                    <div className="mt-3">
                      <p className="text-xs card-muted">ゲスト（この日は確定参加）</p>
                      {gList.length === 0 ? (
                        <p className="text-sm card-muted mt-1">ゲストなし</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {gList.map((g) => (
                            <span key={g.id} className="badge">
                              {g.name}
                              {g.note ? `（${g.note}）` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ゲスト追加 */}
        <div className="mt-4 card" style={{ padding: 14 }}>
          <h3 className="font-semibold">ゲスト追加</h3>
          <p className="text-sm card-muted mt-1">ゲストは「選択した候補日に確定参加」として◯に加算されます。</p>

          <div className="mt-3 flex flex-wrap gap-2 items-end">
            <div className="min-w-[220px] flex-1">
              <label className="text-xs card-muted">参加日</label>
              <select className="input mt-1" value={guestCandidateId} onChange={(e) => setGuestCandidateId(e.target.value)}>
                {activeCandidates.length === 0 ? <option value="">（候補がありません）</option> : null}
                {activeCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.date}（最低 {c.min_players} 人）
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="text-xs card-muted">ゲスト名</label>
              <input
                className="input mt-1"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="例）やないけ"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="text-xs card-muted">メモ（任意）</label>
              <input
                className="input mt-1"
                value={guestNote}
                onChange={(e) => setGuestNote(e.target.value)}
                placeholder="例）20時〜"
              />
            </div>

            <button className="btn btn-primary" onClick={addGuest}>
              追加
            </button>
          </div>
        </div>

        {/* ===== ② 開催確定（Step3） ===== */}
        <div className="mt-4 card" style={{ padding: 14 }}>
          <h3 className="font-semibold">開催確定</h3>
          <p className="text-sm card-muted mt-1">「開催確定」を押した日程がここに並びます。</p>

          {events.length === 0 ? (
            <p className="text-sm card-muted mt-3">まだ開催確定はありません。</p>
          ) : (
            <div className="mt-3 space-y-4">
              {/* 今後 */}
              <div>
                <p className="text-xs card-muted">開催予定</p>
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm card-muted mt-2">ありません</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {upcomingEvents.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge">開催確定</span>
                            <span className="font-semibold">{e.date}</span>
                            {e.start_time ? (
                              <span className="badge">開始 {hhmm(e.start_time)}</span>
                            ) : (
                              <span className="badge">開始 未設定</span>
                            )}
                            <span className="badge">最低 {e.min_players} 人</span>
                          </div>
                          {e.note ? <p className="text-xs card-muted mt-1 break-all">メモ：{e.note}</p> : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Link className="btn" href={`/event/${e.id}`}>
                            詳細
                          </Link>

                          {/* ✅ ownerのみ：確定取り消し */}
                          {isOwner ? (
                            <button
                              className="btn"
                              onClick={() => deleteEvent(e.id)}
                              style={{ borderColor: "rgba(239, 68, 68, 0.45)" }}
                            >
                              確定取り消し
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 過去 */}
              <div>
                <p className="text-xs card-muted">過去（開催済み）</p>
                {pastEvents.length === 0 ? (
                  <p className="text-sm card-muted mt-2">ありません</p>
                ) : (
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer">表示する（{pastEvents.length}件）</summary>
                    <ul className="mt-2 space-y-2">
                      {pastEvents.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="badge">開催記録</span>
                              <span className="font-semibold">{e.date}</span>
                              {e.start_time ? <span className="badge">開始 {hhmm(e.start_time)}</span> : null}
                            </div>
                            {e.note ? <p className="text-xs card-muted mt-1 break-all">メモ：{e.note}</p> : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <Link className="btn" href={`/event/${e.id}`}>
                              詳細
                            </Link>

                            {/* ✅ ownerのみ：過去も取り消しOK（必要なら後でOFFにできる） */}
                            {isOwner ? (
                              <button
                                className="btn"
                                onClick={() => deleteEvent(e.id)}
                                style={{ borderColor: "rgba(239, 68, 68, 0.45)" }}
                              >
                                確定取り消し
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== ③ メンバー ===== */}
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

      {/* ===== ④ 招待 ===== */}
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
    </main>
  );
}