"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false); // 再設定用セッションがあるか

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // メールのリンクから来ると、Supabaseがhash内のトークンを処理して
    // PASSWORD_RECOVERY イベント／セッションを発火する
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      setChecking(false);
    })();

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const update = async () => {
    setMsg(null);
    setErr(null);

    try {
      if (!password) throw new Error("新しいパスワードを入力してください");
      if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
      if (password !== password2) throw new Error("パスワード（確認）が一致しません");

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);

      setDone(true);
      setMsg("パスワードを更新しました。新しいパスワードでログインしてください。");

      // 再設定用セッションは破棄してログイン画面へ
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/login"), 1800);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  };

  if (checking) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">パスワード再設定</h1>

      <div className="mt-4 border rounded p-4">
        {!ready ? (
          <>
            <p className="text-sm text-gray-700">
              再設定用のリンクが確認できませんでした。メールに届いた「パスワード再設定」リンクから開き直してください。
              リンクには有効期限があります。
            </p>
            <Link className="underline text-sm mt-3 block" href="/login">
              ログイン画面へ戻る
            </Link>
          </>
        ) : (
          <>
            <label className="text-sm text-gray-700">新しいパスワード（8文字以上）</label>
            <input
              type="password"
              autoComplete="new-password"
              className="border rounded px-3 py-2 w-full mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="新しいパスワード"
              disabled={done}
            />

            <label className="text-sm text-gray-700 mt-3 block">新しいパスワード（確認）</label>
            <input
              type="password"
              autoComplete="new-password"
              className="border rounded px-3 py-2 w-full mt-1"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="もう一度入力"
              disabled={done}
            />

            {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
            {msg && <p className="text-green-700 text-sm mt-3">{msg}</p>}

            <button
              className="bg-blue-600 text-white rounded px-4 py-2 mt-4 w-full disabled:opacity-50"
              onClick={update}
              disabled={done}
            >
              パスワードを更新する
            </button>
          </>
        )}
      </div>
    </main>
  );
}
