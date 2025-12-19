"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Room = {
  id: string;
  name: string;
  created_at: string;
};

type Member = {
  user_id: string;
  display_name: string;
  role: string;
};

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  required_yes: number;
  created_at: string;
};

type RsvpRow = {
  event_id: string;
  user_id: string;
  status: "yes" | "maybe" | "no";
};

function formatJstTitle(iso: string) {
  // 例：2025/12/19(金) 21:00
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatJstDateOnly(iso: string) {
  // 例：2025/12/19(金)
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(d);
}

function formatJstTimeOnly(iso: string) {
  // 例：21:00
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function RoomPage() {
  const router = useRouter();
  const { roomId } = useParams<{ roomId: string }>();

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);

  // 作成フォーム（タイトルは不要なので持たない）
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [requiredYes, setRequiredYes] = useState(4);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // owner 判定
  const isOwner = useMemo(() => {
    if (!me) return false;
    return members.some((m) => m.user_id === me.id && m.role === "owner");
  }, [me, members]);

  // RSVP集計
  const rsvpMap = useMemo(() => {
    const map = new Map<string, Map<string, RsvpRow["status"]>>();
    for (const r of rsvps) {
      if (!map.has(r.event_id)) map.set(r.event_id, new Map());
      map.get(r.event_id)!.set(r.user_id, r.status);
    }
    return map;
  }, [rsvps]);

  const countsFor = (eventId: string) => {
    const m = rsvpMap.get(eventId) ?? new Map<string, RsvpRow["status"]>();
    let yes = 0,
      maybe = 0,
      no = 0;
    for (const s of m.values()) {
      if (s === "yes") yes++;
      else if (s === "no") no++;
      else maybe++;
    }
    return { yes, maybe, no };
  };

  const myStatusFor = (eventId: string): "yes" | "maybe" | "no" => {
    if (!me) return "maybe";
    return (rsvpMap.get(eventId)?.get(me.id) as any) ?? "maybe";
  };

  const labelOf = (s: "yes" | "maybe" | "no") => (s === "yes" ? "参加" : s === "no" ? "不参加" : "未定");

  // 初期ロード
  const loadAll = async () => {
    setError(null);
    setLoading(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setError(userErr.message);
      setLoading(false);
      return;
    }
    if (!userData.user) {
      router.push("/login");
      return;
    }
    setMe({ id: userData.user.id, email: userData.user.email ?? null });

    const { data: roomData, error: roomErr } = await supabase
      .from("rooms")
      .select("id,name,created_at")
      .eq("id", roomId)
      .single();

    if (roomErr) {
      setError(roomErr.message);
      setLoading(false);
      return;
    }
    setRoom(roomData);

    const { data: memData, error: memErr } = await supabase
      .from("room_members")
      .select("user_id,display_name,role,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }
    setMembers(memData ?? []);

    const nowIso = new Date().toISOString();
    const { data: evData, error: evErr } = await supabase
      .from("events")
      .select("id,title,starts_at,required_yes,created_at")
      .eq("room_id", roomId)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(10);

    if (evErr) {
      setError(evErr.message);
      setLoading(false);
      return;
    }
    const evs = evData ?? [];
    setEvents(evs);

    if (evs.length > 0) {
      const ids = evs.map((e) => e.id);
      const { data: rData, error: rErr } = await supabase
        .from("rsvps")
        .select("event_id,user_id,status")
        .in("event_id", ids);

      if (rErr) {
        setError(rErr.message);
        setLoading(false);
        return;
      }
      setRsvps(rData ?? []);
    } else {
      setRsvps([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // イベント作成（タイトルは日付から自動生成）
  const createEvent = async () => {
    setError(null);
    if (!me) return;

    if (!startsAtLocal) {
      setError("日時を入力してください");
      return;
    }

    const startsIso = new Date(startsAtLocal).toISOString();
    const autoTitle = formatJstTitle(startsIso);

    const { error } = await supabase.from("events").insert({
      room_id: roomId,
      title: autoTitle, // DBのtitleを日付文字列にする
      starts_at: startsIso,
      required_yes: requiredYes,
      created_by: me.id,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setStartsAtLocal("");
    await loadAll();
  };

  // RSVP
  const setMyRsvp = async (eventId: string, status: "yes" | "maybe" | "no") => {
    setError(null);
    if (!me) return;

    const { error } = await supabase.from("rsvps").upsert(
      { event_id: eventId, user_id: me.id, status },
      { onConflict: "event_id,user_id" }
    );

    if (error) {
      setError(error.message);
      return;
    }

    await loadAll();
  };

  // 削除
  const deleteEvent = async (eventId: string) => {
    setError(null);

    if (!isOwner) {
      setError("削除できるのはownerのみです");
      return;
    }

    const ok = confirm("この候補日を削除します。よろしいですか？");
    if (!ok) return;

    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      setError(error.message);
      return;
    }

    await loadAll();
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <Link href="/" className="underline text-sm">
        ← ルーム一覧へ
      </Link>

      <h1 className="text-2xl font-bold mt-2">{room?.name}</h1>

      {error && <p className="text-red-600 mt-3">{error}</p>}

      {/* 作成 */}
      <section className="mt-6 border rounded p-4">
        <h2 className="font-semibold">日程を追加</h2>

        <div className="mt-3 grid gap-3">
          <div>
            <label className="text-sm text-gray-700">開始日時（JST）</label>
            <input
              type="datetime-local"
              className="border rounded px-3 py-2 w-full mt-1"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-700">最低人数</label>
            <input
              type="number"
              min={2}
              max={12}
              className="border rounded px-3 py-2 w-full mt-1"
              value={requiredYes}
              onChange={(e) => setRequiredYes(Number(e.target.value))}
            />
          </div>

          <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={createEvent}>
            追加
          </button>

          <p className="text-xs text-gray-500">
            タイトルは入力不要。追加した日時がそのまま“タイトル”として表示されます。
          </p>
        </div>
      </section>

      {/* 一覧 */}
      <section className="mt-6">
        <h2 className="font-semibold">候補日程</h2>

        {events.length === 0 ? (
          <p className="text-sm text-gray-600 mt-2">まだ候補日がありません。</p>
        ) : (
          <div className="mt-3 space-y-3">
            {events.map((ev) => {
              const { yes, maybe, no } = countsFor(ev.id);
              const ok = yes >= ev.required_yes;
              const my = myStatusFor(ev.id);

              // “日付がタイトル”っぽく見える表示
              const dateTitle = formatJstDateOnly(ev.starts_at);
              const timeText = formatJstTimeOnly(ev.starts_at);

              return (
                <div key={ev.id} className="border rounded p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{dateTitle}</div>
                      <div className="text-sm text-gray-600">開始：{timeText}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-sm border px-2 py-1 rounded">
                        {ok ? `開催確定（参加 ${yes}/${ev.required_yes}）` : `未成立（あと ${ev.required_yes - yes} 人）`}
                      </div>

                      {isOwner && (
                        <button className="text-sm text-red-600 underline" onClick={() => deleteEvent(ev.id)}>
                          削除
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-gray-700">
                    参加：{yes} ／ 未定：{maybe} ／ 不参加：{no}　|　あなた：{labelOf(my)}
                  </div>

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button onClick={() => setMyRsvp(ev.id, "yes")} className="border px-3 py-2 rounded">
                      参加
                    </button>
                    <button onClick={() => setMyRsvp(ev.id, "maybe")} className="border px-3 py-2 rounded">
                      未定
                    </button>
                    <button onClick={() => setMyRsvp(ev.id, "no")} className="border px-3 py-2 rounded">
                      不参加
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
