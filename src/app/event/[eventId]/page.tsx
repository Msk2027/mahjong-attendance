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

type Participant = {
  id?: string;
  event_id: string;
  user_id: string | null;
  display_name: string;
  kind: string | null; // 'member' or 'guest' (ある想定)
  guest_name?: string | null;
  name?: string | null;
};

const formatJst = (iso: string) => {
  // ISO -> "YYYY/MM/DD HH:MM"
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
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
  const [participants, setParticipants] = useState<Participant[]>([]);
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
      setMeId(userData.user?.id ?? null);

      // event取得
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id,room_id,candidate_id,date,min_players,starts_at,note,created_by,created_at")
        .eq("id", eventId)
        .single();

      if (evErr) throw new Error(evErr.message);

      setEvent(ev as EventRow);

      // 初期値
      const starts = new Date((ev as any).starts_at);
      const hh = String(starts.getHours()).padStart(2, "0");
      const mm = String(starts.getMinutes()).padStart(2, "0");
      setTime(`${hh}:${mm}`);
      setNote((ev as any).note ?? "");

      // participants（列が多少違っても落ちないように最低限で取る）
      const { data: ps, error: pErr } = await supabase
        .from("event_participants")
        .select("*")
        .eq("event_id", eventId);

      if (pErr) throw new Error(pErr.message);

      const list: Participant[] = (ps ?? []).map((p: any) => ({
        id: p.id,
        event_id: p.event_id,
        user_id: p.user_id ?? null,
        display_name: p.display_name ?? p.name ?? p.guest_name ?? "unknown",
        kind: p.kind ?? null,
        guest_name: p.guest_name ?? null,
        name: p.name ?? null,
      }));

      // kindがあれば member→guest順、なければそのまま
      list.sort((a, b) => {
        const ak = a.kind ?? "";
        const bk = b.kind ?? "";
        if (ak === bk) return a.display_name.localeCompare(b.display_name);
        if (ak === "member") return -1;
        if (bk === "member") return 1;
        return ak.localeCompare(bk);
      });

      setParticipants(list);
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
    const when = formatJst(event.starts_at);
    const lines = [
      `【麻雀 開催確定】`,
      `日程：${event.date}`,
      `開始：${when.slice(-5)}`,
      `参加：${participants.length}人`,
      `URL：${typeof window !== "undefined" ? window.location.href : ""}`,
    ];
    if (event.note) lines.push(`メモ：${event.note}`);
    return lines.join("\n");
  }, [event, participants.length]);

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
        <div className="mt-4 card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}>
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
              <span className="badge">開始：{formatJst(event.starts_at).slice(-5)}</span>
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
            <h2 className="font-semibold">参加者</h2>
            <ul className="mt-3 space-y-2">
              {participants.map((p, i) => (
                <li key={p.id ?? `${p.event_id}-${i}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.kind ? <span className="badge">{p.kind}</span> : null}
                    <span className="text-sm">{p.display_name}</span>
                    {p.user_id && p.user_id === meId ? <span className="badge">あなた</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}