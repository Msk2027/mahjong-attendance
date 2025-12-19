"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  const signUp = async () => {
    setError(null);

    const dn = displayName.trim();
    if (!dn) {
      setError("ユーザー名を入力してください");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }

    // signUp直後に user が取れない場合があるので getUser で確実に取る
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user ?? data.user;
    if (!user) {
      setError("ユーザー作成に失敗しました（user取得失敗）");
      return;
    }

    // profiles に保存（既存があっても上書き）
    const { error: pErr } = await supabase.from("profiles").upsert({
      user_id: user.id,
      display_name: dn,
    });

    if (pErr) {
      setError(pErr.message);
      return;
    }

    router.push("/");
  };

  const signIn = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else router.push("/");
  };

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">ログイン / 新規登録</h1>

      <div className="mb-4">
        <label className="text-sm text-gray-700">ユーザー名（新規登録で使用）</label>
        <input
          className="border p-2 w-full mt-1"
          placeholder="例）きゃらまき"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">※ログイン時は入力不要（空でもOK）</p>
      </div>

      <input
        className="border p-2 w-full mb-2"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border p-2 w-full mb-4"
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p className="text-red-500 mb-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={signIn} className="bg-blue-600 text-white px-4 py-2 rounded">
          ログイン
        </button>
        <button onClick={signUp} className="bg-gray-600 text-white px-4 py-2 rounded">
          新規登録
        </button>
      </div>
    </main>
  );
}
