"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type EventRow = {
  id: string;
  room_id: string;
  candidate_id: string;
  date: string; // yyyy-mm-dd
  min_players: number;
  starts_at: string; // timestamptz
  note: string | null;
  created_by: string;
  created_at: string;
};

type Member = {
  user_id: string;
  display_name: string;
  role: string;
};

type Rsvp = {
  candidate_id: string;
  user_id: string;
  status: "yes" | "maybe" | "no";
};

type Guest = {
  id: string;
  room_id: string;
  candidate_id: string | null;
  name: string;
  note: string | null;
};

type ParticipantView = {
  key: string;
  kind: "member" | "guest";
  display_name: string;
  note?: string | null;
  isMe?: boolean;
};

const formatJstHM = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

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
  const [meId, setMeId] = useState<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 開始時刻編集用（HH:MM）
  const [time, setTime] = useState<string>("20:00");
  const [note, setNote] = useState<string>("");

  const load = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!eventId) return;

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setMeId(uid);

      // event取得
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id,room_id,candidate_id,date,min_players,starts_at,note,created_by,created_at")
        .eq("id", eventId)
        .single();

      if (evErr) throw new Error(evErr.message);

      const evRow = ev as EventRow;
      setEvent(evRow);

      // 初期値
      setTime(formatJstHM(evRow.starts_at));
      setNote(evRow.note ?? "");

      // ✅ ここから「参加者」を live で合成する
      // 1) room_members
      const { data: memData, error: memErr } = await supabase
        .from("room_members")
        .select("user_id,display_name,role")
        .eq("room_id", evRow.room_id);

      if (memErr) throw new Error(memErr.message);

      const members: Member[] = (memData ?? []).map((m: any) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        role: m.role,
      }));

      // 2) rsvps（この candidate の ◯ だけ）
      const { data: rsvpData, error: rsvpErr } = await supabase
        .from("rsvps")
        .select("candidate_id,user_id,status")
        .eq("room_id", evRow.room_id)
        .eq("candidate_id", evRow.candidate_id);

      if (rsvpErr) throw new Error(rsvpErr.message);

      const rsvps: Rsvp[] = (rsvpData ?? []).map((r: any) => ({
        candidate_id: r.candidate_id,
        user_id: r.user_id,
        status: r.status,
      }));

      const yesUserIds = new Set(rsvps.filter((r) => r.status === "yes").map((r) => r.user_id));

      // 3) guests（この candidate に紐づくもの）
      const { data: guestData, error: guestErr } = await supabase
        .from("room_guests")
        .select("id,room_id,candidate_id,name,note")
        .eq("room_id", evRow.room_id)
        .eq("candidate_id", evRow.candidate_id);

      if (guestErr) throw new Error(guestErr.message);

      const guests: Guest[] = (guestData ?? []).map((g: any) => ({
        id: g.id,
        room_id: g.room_id,
        candidate_id: g.candidate_id ?? null,
        name: g.name,
        note: g.note ?? null,
      }));

      const memberParticipants: ParticipantView[] = members
        .filter((m) => yesUserIds.has(m.user_id))
        .map((m) => ({
          key: `m-${m.user_id}`,
          kind: "member" as const,
          display_name: m.display_name,
          isMe: uid ? m.user_id === uid : false,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      const guestParticipants: ParticipantView[] = guests
        .map((g) => ({
          key: `g-${g.id}`,
          kind: "guest" as const,
          display_name: g.name,
          note: g.note,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      setParticipants([...memberParticipants, ...guestParticipants]);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const saveTimeAndNote = async () => {
    setError(null);
    try {
      if (!event) return;

      // date + HH:MM を JST で組み立て → timestamptz
      const iso = `${event.date}T${time}:00+09:00`;

      const { error } = await supabase
        .from("events")
        .update({ starts_at: iso, note: note.trim() ? note.trim() : null })
        .eq("id", event.id);

      if (error) throw new Error(error.message);

      await load();
      alert("保存しました！");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  };

  const shareText = useMemo(() => {
    if (!event) return "";
    const lines = [
      `【麻雀 開催確定】`,
      `日程：${event.date}`,
      `開始：${formatJstHM(event.starts_at)}`,
      `参加：${participants.length}人（メンバー◯＋ゲスト）`,
      `URL：${typeof window !== "undefined" ? window.location.href : ""}`,
    ];
    if (event.note) lines.push(`メモ：${event.note}`);
    return lines.join("\n");
  }, [event, participants]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました！");
    } catch {
      alert("コピーに失敗しました（ブラウザ権限を確認）");
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <Link className="underline text-sm" href={event ? `/room/${event.room_id}` : "/"}>
        ← ルームへ戻る
      </Link>

      <h1 className="text-2xl font-bold mt-2">開催詳細</h1>

      {error && (
        <div
          className="mt-4 card"
          style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}
        >
          <p className="text-sm">エラー：{error}</p>
        </div>
      )}

      {!event ? (
        <p className="mt-4">イベントが見つかりません。</p>
      ) : (
        <>
          <section className="mt-4 card">
            <div className="flex flex-wrap gap-2">
              <span className="badge">日程：{event.date}</span>
              <span className="badge">最低：{event.min_players}人</span>
              <span className="badge">参加：{participants.length}人</span>
              <span className="badge">開始：{formatJstHM(event.starts_at)}</span>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold">開始時刻</p>
              <div className="mt-2 flex gap-2 items-center">
                <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                <button className="btn btn-primary" onClick={saveTimeAndNote}>
                  保存
                </button>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold">メモ（任意）</p>
              <textarea
                className="input mt-2"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例）池袋 19:50集合 / 会費3000円 など"
              />
              <button className="btn mt-2" onClick={saveTimeAndNote}>
                メモも保存
              </button>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold">共有テキスト</p>
              <pre className="mt-2 card" style={{ padding: 12, whiteSpace: "pre-wrap" }}>
                {shareText}
              </pre>
              <button className="btn mt-2" onClick={() => copy(shareText)}>
                共有文をコピー
              </button>
            </div>
          </section>

          <section className="mt-4 card">
            <h2 className="font-semibold">参加者（メンバー◯＋ゲスト）</h2>
            {participants.length === 0 ? (
              <p className="text-sm card-muted mt-2">参加者がいません（メンバーが◯にしてるか確認）</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {participants.map((p) => (
                  <li key={p.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="badge">{p.kind}</span>
                      <span className="text-sm">{p.display_name}</span>
                      {p.isMe ? <span className="badge">あなた</span> : null}
                      {p.kind === "guest" && p.note ? <span className="badge">({p.note})</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}