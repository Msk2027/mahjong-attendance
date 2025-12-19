"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // signup only
  const [displayName, setDisplayName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // すでにログイン済みなら / に戻す
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/");
        return;
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const onLogin = async () => {
    setError(null);
    setInfo(null);

    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password: p,
    });

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/");
  };

  const onSignup = async () => {
    setError(null);
    setInfo(null);

    const e = email.trim();
    const p = password;
    const dn = displayName.trim();

    if (!e || !p || !dn) {
      setError("メールアドレス・パスワード・ユーザー名を入力してください");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: p,
    });

    if (error) {
      setError(error.message);
      return;
    }

    // signUp 直後に user が取れない場合があるので、少し丁寧に処理
    const userId = data.user?.id;

    if (userId) {
      const { error: pErr } = await supabase.from("profiles").upsert({
        user_id: userId,
        display_name: dn,
      });
      if (pErr) {
        setError(pErr.message);
        return;
      }
      setInfo("登録できました。ログインしました。");
      router.replace("/");
      return;
    }

    // もしEmail確認が必要な設定なら、ここに来ることがある
    setInfo("確認メールを送信しました。メールのリンクから完了してください。");
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">ログイン</h1>

      <div className="mt-3 flex gap-2">
        <button
          className={`border rounded px-3 py-2 text-sm ${mode === "login" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("login")}
        >
          ログイン
        </button>
        <button
          className={`border rounded px-3 py-2 text-sm ${mode === "signup" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("signup")}
        >
          新規登録
        </button>
      </div>

      <div className="mt-4 border rounded p-4">
        <label className="text-sm text-gray-700">メールアドレス</label>
        <input
          className="border rounded px-3 py-2 w-full mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="text-sm text-gray-700 mt-3 block">パスワード</label>
        <input
          type="password"
          className="border rounded px-3 py-2 w-full mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />

        {mode === "signup" && (
          <>
            <label className="text-sm text-gray-700 mt-3 block">ユーザー名</label>
            <input
              className="border rounded px-3 py-2 w-full mt-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例）やないけ"
            />
          </>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        {info && <p className="text-green-700 text-sm mt-3">{info}</p>}

        {mode === "login" ? (
          <button className="bg-blue-600 text-white rounded px-4 py-2 mt-4 w-full" onClick={onLogin}>
            ログイン
          </button>
        ) : (
          <button className="bg-blue-600 text-white rounded px-4 py-2 mt-4 w-full" onClick={onSignup}>
            新規登録
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        ※ うまく戻れない時は一度 <Link className="underline" href="/login">/login</Link> を再読み込みしてね
      </p>
    </main>
  );
}
