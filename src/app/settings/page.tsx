"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }
      setMe({ id: userData.user.id, email: userData.user.email ?? null });

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userData.user.id)
        .single();

      setDisplayName(prof?.display_name ?? "");
      setLoading(false);
    })();
  }, [router]);

  const save = async () => {
    setMsg(null);
    setErr(null);
    if (!me) return;

    const dn = displayName.trim();
    if (!dn) {
      setErr("ユーザー名を入力してください");
      return;
    }

    const { error: pErr } = await supabase.from("profiles").upsert({
      user_id: me.id,
      display_name: dn,
    });
    if (pErr) {
      setErr(pErr.message);
      return;
    }

    // 既存ルームも表示名を揃える
    const { error: mErr } = await supabase
      .from("room_members")
      .update({ display_name: dn })
      .eq("user_id", me.id);

    if (mErr) {
      setErr(mErr.message);
      return;
    }

    setMsg("保存しました！");
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-xl mx-auto">
      <Link className="underline text-sm" href="/">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold mt-2">設定</h1>
      <p className="text-sm text-gray-600 mt-1">ログイン：{me?.email}</p>

      <div className="mt-6 border rounded-lg p-4">
        <label className="text-sm text-gray-700">ユーザー名</label>
        <input
          className="border rounded px-3 py-2 w-full mt-1"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例）きゃらまき"
        />

        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        {msg && <p className="text-green-700 text-sm mt-2">{msg}</p>}

        <button className="bg-blue-600 text-white rounded px-4 py-2 mt-3" onClick={save}>
          保存
        </button>
      </div>
    </main>
  );
}
