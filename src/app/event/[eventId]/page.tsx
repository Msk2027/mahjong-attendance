"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Me = { id: string; email: string | null };

type EventRow = {
  id: string;
  room_id: string;
  date: string; // yyyy-mm-dd
  min_players: number;
  start_time: string | null; // HH:MM:SS
  note: string | null;
};

type Member = {
  user_id: string;
  display_name: string;
  role: string; // owner/member
};

type Participant = {
  id: string;
  event_id: string;
  room_id: string;
  kind: "member" | "guest";
  status: "in" | "out";
  user_id: string | null;
  guest_name: string | null;
  guest_note: string | null;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function EventPage() {
  const router = useRouter();
  const params = useParams();

  const eventId = useMemo(() => {
    const v = (params as any)?.eventId;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0];
    return "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UI: ゲスト追加
  const [guestName, setGuestName] = useState("");
  const [guestNote, setGuestNote] = useState("");

  // owner用：未参加メンバーを追加する
  const [addMemberUserId, setAddMemberUserId] = useState("");

  const myRole = useMemo(() => {
    if (!me) return null;
    return members.find((m) => m.user_id === me.id)?.role ?? null;
  }, [me, members]);

  const isOwner = myRole === "owner";

  const loadAll = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!eventId) return;

      // セッション
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

      // event
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id,room_id,date,min_players,start_time,note")
        .eq("id", eventId)
        .single();

      if (evErr) throw new Error(evErr.message);
      setEvent(ev as EventRow);

      // members (room_members)
      const { data: mem, error: memErr } = await supabase
        .from("room_members")
        .select("user_id,display_name,role")
        .eq("room_id", (ev as any).room_id);

      if (memErr) throw new Error(memErr.message);

      const memList: Member[] = (mem ?? []).map((m: any) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        role: m.role,
      }));
      setMembers(memList);

      // participants
      const { data: ps, error: psErr } = await supabase
        .from("event_participants")
        .select("id,event_id,room_id,kind,status,user_id,guest_name,guest_note")
        .eq("event_id", eventId)
        .order("updated_at", { ascending: true });

      if (psErr) throw new Error(psErr.message);

      setParticipants(
        (ps ?? []).map((p: any) => ({
          id: p.id,
          event_id: p.event_id,
          room_id: p.room_id,
          kind: p.kind,
          status: p.status,
          user_id: p.user_id ?? null,
          guest_name: p.guest_name ?? null,
          guest_note: p.guest_note ?? null,
        }))
      );

      // owner用のselect初期値
      if (!addMemberUserId) {
        const inMemberUserIds = new Set(
          (ps ?? [])
            .filter((p: any) => p.kind === "member" && p.user_id)
            .map((p: any) => p.user_id)
        );
        const notJoined = memList.filter((m) => !inMemberUserIds.has(m.user_id));
        if (notJoined[0]) setAddMemberUserId(notJoined[0].user_id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ===== derived =====
  const memberParticipants = useMemo(
    () => participants.filter((p) => p.kind === "member"),
    [participants]
  );

  const guestParticipants = useMemo(
    () => participants.filter((p) => p.kind === "guest"),
    [participants]
  );

  const myParticipant = useMemo(() => {
    if (!me) return null;
    return memberParticipants.find((p) => p.user_id === me.id) ?? null;
  }, [me, memberParticipants]);

  const statusText = (s: "in" | "out") => (s === "in" ? "参加" : "不参加");

  const countInMembers = useMemo(
    () => memberParticipants.filter((p) => p.status === "in").length,
    [memberParticipants]
  );
  const countInGuests = useMemo(
    () => guestParticipants.filter((p) => p.status === "in").length,
    [guestParticipants]
  );
  const countInTotal = countInMembers + countInGuests;

  const memberName = (userId: string | null) =>
    members.find((m) => m.user_id === userId)?.display_name ?? "unknown";

  const notJoinedMembers = useMemo(() => {
    const inMemberUserIds = new Set(memberParticipants.map((p) => p.user_id).filter(Boolean) as string[]);
    return members.filter((m) => !inMemberUserIds.has(m.user_id));
  }, [members, memberParticipants]);

  // ===== actions =====
  const upsertMyStatus = async (next: "in" | "out") => {
    setError(null);
    try {
      if (!me) throw new Error("ログイン情報が取得できません");
      if (!event) throw new Error("イベントが見つかりません");

      // 参加者行が無い場合は作る（自分は自分だけ操作OK → RLSで守る）
      const payload = {
        event_id: eventId,
        room_id: event.room_id,
        kind: "member",
        user_id: me.id,
        status: next,
        updated_by: me.id,
      };

      const { error } = await supabase
        .from("event_participants")
        .upsert(payload, { onConflict: "event_id,user_id" });

      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const ownerSetMemberStatus = async (userId: string, next: "in" | "out") => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (!event) throw new Error("イベントが見つかりません");
      if (!me) throw new Error("ログイン情報が取得できません");

      const { error } = await supabase
        .from("event_participants")
        .upsert(
          {
            event_id: eventId,
            room_id: event.room_id,
            kind: "member",
            user_id: userId,
            status: next,
            updated_by: me.id,
          },
          { onConflict: "event_id,user_id" }
        );

      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const ownerRemoveMember = async (userId: string) => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (!confirm("このメンバーをイベント参加者から削除しますか？")) return;

      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", eventId)
        .eq("kind", "member")
        .eq("user_id", userId);

      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const ownerAddMember = async () => {
    setError(null);
    try {
      if (!isOwner) throw new Error("ownerのみ実行できます");
      if (!event) throw new Error("イベントが見つかりません");
      if (!me) throw new Error("ログイン情報が取得できません");

      const uid = addMemberUserId.trim();
      if (!uid) throw new Error("追加するメンバーを選んでください");

      const { error } = await supabase.from("event_participants").upsert(
        {
          event_id: eventId,
          room_id: event.room_id,
          kind: "member",
          user_id: uid,
          status: "in",
          updated_by: me.id,
        },
        { onConflict: "event_id,user_id" }
      );

      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // ゲスト（誰でも追加/削除）
  const addGuest = async () => {
    setError(null);
    try {
      if (!event) throw new Error("イベントが見つかりません");
      if (!me) throw new Error("ログイン情報が取得できません");

      const name = guestName.trim();
      const note = guestNote.trim();
      if (!name) throw new Error("ゲスト名を入力してください");

      const { error } = await supabase.from("event_participants").insert({
        event_id: eventId,
        room_id: event.room_id,
        kind: "guest",
        status: "in",
        guest_name: name,
        guest_note: note ? note : null,
        updated_by: me.id,
      });

      if (error) throw new Error(error.message);

      setGuestName("");
      setGuestNote("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const deleteGuest = async (pid: string) => {
    setError(null);
    try {
      if (!confirm("このゲストを削除しますか？")) return;

      const { error } = await supabase.from("event_participants").delete().eq("id", pid);
      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  // イベント情報（時間/メモ）の更新（ownerだけにしたいなら isOwner ガードを付ける）
  const updateEvent = async (patch: Partial<{ start_time: string | null; note: string | null }>) => {
    setError(null);
    try {
      if (!event) throw new Error("イベントが見つかりません");
      if (!isOwner) throw new Error("ownerのみ変更できます");

      const { error } = await supabase.from("events").update(patch).eq("id", eventId);
      if (error) throw new Error(error.message);

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  if (!event) {
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <Link className="underline text-sm" href="/">
          ← 戻る
        </Link>
        <p className="mt-4">イベントが見つかりません。</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="underline text-sm" href={`/room/${event.room_id}`}>
            ← ルームへ戻る
          </Link>
          <h1 className="text-2xl font-bold mt-2">開催詳細</h1>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="badge">日付：{event.date}</span>
            <span className="badge">開始：{event.start_time ? hhmm(event.start_time) : "未設定"}</span>
            <span className="badge">最低：{event.min_players}人</span>
            <span className="badge">参加：{countInTotal}人（メンバー{countInMembers}+ゲスト{countInGuests}）</span>
            {myRole ? <span className="badge">あなた：{myRole}</span> : null}
          </div>

          {event.note ? <p className="text-sm card-muted mt-2 break-all">メモ：{event.note}</p> : null}
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

      {/* ===== 自分の参加ステータス ===== */}
      <section className="mt-6 card">
        <h2 className="font-semibold">あなたの参加</h2>
        <p className="text-sm card-muted mt-1">
          自分のステータスだけ変更できます（ownerは全員の変更もできます）。
        </p>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="badge">現在：{myParticipant ? statusText(myParticipant.status) : "未登録（不参加扱い）"}</span>

          <button className="btn btn-primary" onClick={() => upsertMyStatus("in")}>
            参加にする
          </button>
          <button className="btn" onClick={() => upsertMyStatus("out")}>
            不参加にする
          </button>
        </div>
      </section>

      {/* ===== メンバー参加者 ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">メンバー（参加者）</h2>

        {memberParticipants.length === 0 ? (
          <p className="text-sm card-muted mt-2">まだ参加者がいません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {memberParticipants.map((p) => {
              const name = memberName(p.user_id);
              const isMe = me?.id && p.user_id === me.id;

              return (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge">member</span>
                      <span className="text-sm font-semibold">{name}{isMe ? "（あなた）" : ""}</span>
                      <span className="badge">{statusText(p.status)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* 自分は自分だけ操作 */}
                    {isMe ? (
                      <>
                        <button className="btn btn-primary" onClick={() => upsertMyStatus("in")}>
                          参加
                        </button>
                        <button className="btn" onClick={() => upsertMyStatus("out")}>
                          不参加
                        </button>
                      </>
                    ) : null}

                    {/* ownerは他人も操作 */}
                    {isOwner && !isMe ? (
                      <>
                        <button className="btn btn-primary" onClick={() => ownerSetMemberStatus(p.user_id!, "in")}>
                          参加
                        </button>
                        <button className="btn" onClick={() => ownerSetMemberStatus(p.user_id!, "out")}>
                          不参加
                        </button>
                        <button
                          className="btn"
                          style={{ borderColor: "rgba(239, 68, 68, 0.45)" }}
                          onClick={() => ownerRemoveMember(p.user_id!)}
                        >
                          削除
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ownerのみ：参加者に「追加」 */}
        {isOwner ? (
          <div className="mt-4 card" style={{ padding: 14 }}>
            <h3 className="font-semibold">メンバーを追加（owner）</h3>
            <p className="text-sm card-muted mt-1">まだイベント参加者に入っていないルームメンバーを追加できます。</p>

            {notJoinedMembers.length === 0 ? (
              <p className="text-sm card-muted mt-2">追加できるメンバーがいません。</p>
            ) : (
              <div className="mt-3 flex gap-2 flex-wrap items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs card-muted">追加するメンバー</label>
                  <select
                    className="input mt-1"
                    value={addMemberUserId}
                    onChange={(e) => setAddMemberUserId(e.target.value)}
                  >
                    {notJoinedMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}（{m.role}）
                      </option>
                    ))}
                  </select>
                </div>

                <button className="btn btn-primary" onClick={ownerAddMember}>
                  追加
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ===== ゲスト ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">ゲスト</h2>
        <p className="text-sm card-muted mt-1">ゲストは誰でも追加・削除できます。</p>

        {guestParticipants.length === 0 ? (
          <p className="text-sm card-muted mt-2">ゲストなし</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {guestParticipants.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge">guest</span>
                    <span className="text-sm font-semibold">{g.guest_name ?? "guest"}</span>
                    <span className="badge">{statusText(g.status)}</span>
                  </div>
                  {g.guest_note ? <p className="text-xs card-muted mt-1 break-all">メモ：{g.guest_note}</p> : null}
                </div>

                <button
                  className="btn"
                  style={{ borderColor: "rgba(239, 68, 68, 0.45)" }}
                  onClick={() => deleteGuest(g.id)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 card" style={{ padding: 14 }}>
          <h3 className="font-semibold">ゲスト追加</h3>

          <div className="mt-3 flex flex-wrap gap-2 items-end">
            <div className="min-w-[220px] flex-1">
              <label className="text-xs card-muted">名前</label>
              <input
                className="input mt-1"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="例）友人A"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="text-xs card-muted">メモ（任意）</label>
              <input
                className="input mt-1"
                value={guestNote}
                onChange={(e) => setGuestNote(e.target.value)}
                placeholder="例）19:30合流"
              />
            </div>

            <button className="btn btn-primary" onClick={addGuest}>
              追加
            </button>
          </div>
        </div>
      </section>

      {/* ===== owner: 開催時間 / メモ編集 ===== */}
      <section className="mt-4 card">
        <h2 className="font-semibold">開催情報の共有（owner）</h2>
        <p className="text-sm card-muted mt-1">開始時刻・メモの変更は owner のみ。</p>

        {!isOwner ? (
          <p className="text-sm card-muted mt-3">ownerのみ編集できます。</p>
        ) : (
          <EventEditor event={event} onSave={updateEvent} />
        )}
      </section>
    </main>
  );
}

function EventEditor({
  event,
  onSave,
}: {
  event: { start_time: string | null; note: string | null };
  onSave: (patch: Partial<{ start_time: string | null; note: string | null }>) => Promise<void>;
}) {
  const [time, setTime] = useState(event.start_time ? event.start_time.slice(0, 5) : "");
  const [note, setNote] = useState(event.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTime(event.start_time ? event.start_time.slice(0, 5) : "");
    setNote(event.note ?? "");
  }, [event.start_time, event.note]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        start_time: time ? `${time}:00` : null,
        note: note.trim() ? note.trim() : null,
      });
      alert("保存しました！");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 card" style={{ padding: 14 }}>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-[180px]">
          <label className="text-xs card-muted">開始時刻</label>
          <input className="input mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <div className="flex-1 min-w-[220px]">
          <label className="text-xs card-muted">メモ</label>
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）池袋 19:00集合" />
        </div>

        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}