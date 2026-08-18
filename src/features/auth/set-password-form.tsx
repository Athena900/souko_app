"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      const supabase = await getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) setError("招待リンクの有効期限が切れているか、すでに使用されています。管理者へ再招待を依頼してください。");
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setError("招待情報を確認できませんでした。もう一度招待メールのリンクを開いてください。");
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) {
      setError("パスワードは12文字以上で設定してください。");
      return;
    }
    if (password !== confirmation) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      window.location.replace("/");
    } catch {
      setError("パスワードを設定できませんでした。もう一度招待メールのリンクを開いてください。");
      setBusy(false);
    }
  }

  return (
    <form className="panel auth-card" onSubmit={submit}>
      <div className="auth-heading">
        <span className="tag">初回設定</span>
        <h1>パスワードを設定</h1>
        <p className="muted">招待メールを開いた利用者だけが設定できます。12文字以上のパスワードを入力してください。</p>
      </div>
      <div className="field">
        <label htmlFor="setupPassword">パスワード</label>
        <input id="setupPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required disabled={!ready || Boolean(error)} />
      </div>
      <div className="field">
        <label htmlFor="setupPasswordConfirmation">確認用パスワード</label>
        <input id="setupPasswordConfirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} required disabled={!ready || Boolean(error)} />
      </div>
      <button className="button auth-submit" type="submit" disabled={!ready || busy || Boolean(error)}>{busy ? "設定中…" : "パスワードを設定して開始"}</button>
      {error && <div className="status error" role="alert">{error}</div>}
      <Link className="auth-back" href="/login">ログイン画面へ戻る</Link>
    </form>
  );
}
