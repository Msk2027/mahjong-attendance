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
    let cancelled = false;

    // メールのリンクから来ると、Supabaseがトークンを処理して
    // PASSWORD_RECOVERY イベント／セッションを発火する
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });

    // URLのトークン処理は非同期なので、少しの間リトライしながらセッションを待つ
    (async () => {
      for (let i = 0; i < 12; i++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setReady(true);
          setChecking(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) setChecking(false);
    })();

    return () => {
      cancelled = true;
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

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <div className="card">
        <h1 className="text-2xl font-bold">パスワード再設定</h1>

        {checking ? (
          <p className="card-muted text-sm mt-3">確認中…</p>
        ) : !ready ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              再設定用のリンクが確認できませんでした。
            </p>
            <ul className="text-sm card-muted list-disc pl-5 space-y-1">
              <li>メールに届いた「パスワード再設定」リンクから開き直してください。</li>
              <li>リンクには有効期限があります（古い場合はもう一度送信してください）。</li>
            </ul>
            <Link className="btn mt-1 inline-flex" href="/login">
              ログイン画面へ戻る
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm">新しいパスワード（8文字以上）</label>
              <input
                type="password"
                autoComplete="new-password"
                className="input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="新しいパスワード"
                disabled={done}
              />
            </div>

            <div>
              <label className="text-sm">新しいパスワード（確認）</label>
              <input
                type="password"
                autoComplete="new-password"
                className="input mt-1"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="もう一度入力"
                disabled={done}
              />
            </div>

            {err && (
              <div className="card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}>
                <p className="text-sm">エラー：{err}</p>
              </div>
            )}
            {msg && (
              <div className="card" style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(20,83,45,0.25)" }}>
                <p className="text-sm">{msg}</p>
              </div>
            )}

            <button className="btn btn-primary w-full disabled:opacity-50" onClick={update} disabled={done}>
              パスワードを更新する
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
