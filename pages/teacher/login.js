import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

export default function TeacherLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError("メールアドレスまたはパスワードが正しくありません。"); return; }
    router.replace("/teacher/dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 360, background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 24, fontWeight: 800 }}>教員ログイン</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>ことばの道場・管理サイト</div>
        </div>

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>メールアドレス</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 14, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>パスワード</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 20, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        {error && (
          <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "ログイン中…" : "ログイン"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <a href="/login" style={{ color: "var(--ink-soft)" }}>学生の方はこちら</a>
          <a href="/teacher/signup" style={{ color: "var(--ink-soft)" }}>初めての方（登録）</a>
        </div>
      </form>
    </div>
  );
}
