"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      const requestedPath = typeof window === "undefined" ? "/" : new URLSearchParams(window.location.search).get("next") ?? "/";
      const nextPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
      window.location.replace(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ログインできませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel auth-card" onSubmit={submit}>
      <div className="auth-heading">
        <span className="tag">利用者ログイン</span>
        <h1>倉庫業務へログイン</h1>
        <p className="muted">デモ用に発行されたメールアドレスとパスワードを入力してください。</p>
      </div>
      <div className="field">
        <label htmlFor="loginEmail">メールアドレス</label>
        <input id="loginEmail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="loginPassword">パスワード</label>
        <input id="loginPassword" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "ログイン中…" : "ログインする"}</button>
      {error && <div className="status error" role="alert">ログインできませんでした。入力内容と利用者設定を確認してください。</div>}
      <Link className="auth-back" href="/">トップへ戻る</Link>
    </form>
  );
}
