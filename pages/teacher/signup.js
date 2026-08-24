import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

export default function TeacherSignup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/teacher/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, inviteCode }),
    });
    const json = await res.json();
    if (!res.ok) { setLoading(false); setError(json.error || "登録に失敗しました。"); return; }

    // アカウント作成はサーバー側（service_role）で行ったため、
    // ここで改めてログインしてセッションを確立する。
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) { setError("登録は完了しましたが、自動ログインに失敗しました。ログイン画面からログインしてください。"); return; }
    router.replace("/teacher/dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 360, background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 24, fontWeight: 800 }}>教員登録</div>
        </div>

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>お名前</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 14, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>メールアドレス</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 14, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>パスワード（6文字以上）</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 14, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>合言葉（管理者から聞いてください）</label>
        <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 20, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        {error && (
          <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "登録中…" : "登録する"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12 }}>
          <a href="/teacher/login" style={{ color: "var(--ink-soft)" }}>ログインへ戻る</a>
        </div>
      </form>
    </div>
  );
}
