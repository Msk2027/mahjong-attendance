"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Me = { id: string; email: string | null };

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  // profiles
  const [displayName, setDisplayName] = useState("");

  // email change
  const [newEmail, setNewEmail] = useState("");

  // password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr?.message?.includes("Auth session missing") || !userData.user) {
      router.replace("/login");
      return;
    }
    const user = userData.user;
    setMe({ id: user.id, email: user.email ?? null });
    setNewEmail(user.email ?? "");

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    setDisplayName(prof?.display_name ?? "");
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDisplayName = async () => {
    setMsg(null);
    setErr(null);
    try {
      if (!me) return;

      const dn = displayName.trim();
      if (!dn) throw new Error("ユーザー名を入力してください");

      const { error: pErr } = await supabase.from("profiles").upsert({
        user_id: me.id,
        display_name: dn,
      });
      if (pErr) throw new Error(pErr.message);

      // 既存ルーム表示名も更新（あなたの既存仕様）
      const { error: mErr } = await supabase
        .from("room_members")
        .update({ display_name: dn })
        .eq("user_id", me.id);
      if (mErr) throw new Error(mErr.message);

      setMsg("ユーザー名を保存しました！");
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  };

  const changeEmail = async () => {
    setMsg(null);
    setErr(null);

    try {
      if (!me) return;

      const email = newEmail.trim();
      if (!email) throw new Error("新しいメールアドレスを入力してください");

      // メール変更は「確認メール」を経て反映される（Supabase設定次第）
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw new Error(error.message);

      setMsg("確認メールを送信しました。メール内リンクを開くと変更が反映されます。");
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  };

  const changePassword = async () => {
    setMsg(null);
    setErr(null);

    try {
      if (!me) return;

      const cp = currentPassword;
      const p1 = newPassword;
      const p2 = newPassword2;

      if (!cp) throw new Error("現在のパスワードを入力してください");
      if (!p1) throw new Error("新しいパスワードを入力してください");
      if (p1.length < 8) throw new Error("新しいパスワードは8文字以上にしてください");
      if (p1 !== p2) throw new Error("新しいパスワード（確認）が一致しません");

      // いったん再認証（これを入れると「本人が今ログインしてる」保証が強くなる）
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({
        email: me.email ?? "",
        password: cp,
      });
      if (reAuthErr) throw new Error("現在のパスワードが違います");

      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw new Error(error.message);

      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setMsg("パスワードを変更しました！");
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  };

  const sendResetMail = async () => {
    setMsg(null);
    setErr(null);

    try {
      if (!me?.email) throw new Error("メールアドレスが取得できません");

      // パスワード忘れの時用（ログイン中でも使える）
      const { error } = await supabase.auth.resetPasswordForEmail(me.email, {
        redirectTo: `${location.origin}/login`,
      });
      if (error) throw new Error(error.message);

      setMsg("パスワード再設定メールを送信しました（メールを確認してください）。");
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <Link className="underline text-sm" href="/">
        ← 戻る
      </Link>

      <div className="card">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm card-muted mt-1">
          ログイン：{me?.email ?? "unknown"}
        </p>

        {err && (
          <div className="mt-3 card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(127, 29, 29, 0.25)" }}>
            <p className="text-sm">エラー：{err}</p>
          </div>
        )}
        {msg && (
          <div className="mt-3 card" style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(20,83,45,0.25)" }}>
            <p className="text-sm">{msg}</p>
          </div>
        )}
      </div>

      {/* ユーザー名 */}
      <section className="card">
        <h2 className="font-semibold">ユーザー名</h2>
        <p className="text-sm card-muted mt-1">ルーム内表示に使います。</p>
        <input
          className="input mt-3"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例）きゃらまき"
        />
        <button className="btn btn-primary mt-3" onClick={saveDisplayName}>
          保存
        </button>
      </section>

      {/* メール変更 */}
      <section className="card">
        <h2 className="font-semibold">メールアドレス変更</h2>
        <p className="text-sm card-muted mt-1">
          変更後、確認メールのリンクを開くと反映されます。
        </p>
        <input
          className="input mt-3"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new@example.com"
        />
        <button className="btn btn-primary mt-3" onClick={changeEmail}>
          確認メールを送る
        </button>
      </section>

      {/* パスワード変更 */}
      <section className="card">
        <h2 className="font-semibold">パスワード変更</h2>
        <p className="text-sm card-muted mt-1">現在のパスワードで再認証してから変更します。</p>

        <input
          className="input mt-3"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="現在のパスワード"
        />
        <input
          className="input mt-2"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="新しいパスワード（8文字以上）"
        />
        <input
          className="input mt-2"
          type="password"
          value={newPassword2}
          onChange={(e) => setNewPassword2(e.target.value)}
          placeholder="新しいパスワード（確認）"
        />

        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary" onClick={changePassword}>
            変更する
          </button>
          <button className="btn" onClick={sendResetMail}>
            パスワード再設定メールを送る
          </button>
        </div>
      </section>
    </main>
  );
}