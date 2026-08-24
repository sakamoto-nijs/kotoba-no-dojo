import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

export default function TeacherResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null); setLoading(true);
    // メール内のリンクを開いた時点でSupabaseが一時的なセッションを確立している
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMsg("パスワードを変更しました。ログイン画面へ移動します…");
    setTimeout(() => router.replace("/teacher/login"), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 360, background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>新しいパスワードを設定</div>
        </div>

        <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>新しいパスワード（6文字以上）</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 20, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 15 }} />

        {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        {msg && <div style={{ background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{msg}</div>}

        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "変更中…" : "変更する"}
        </button>
      </form>
    </div>
  );
}
