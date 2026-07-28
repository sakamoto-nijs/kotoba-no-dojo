import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

export default function TeacherStudents() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ studentCode: "", displayName: "", password: "", classId: "" });
  const [newClassName, setNewClassName] = useState("");
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStudents = async (teacherId) => {
    const { data } = await supabase.from("profiles").select("id, display_name, student_code, created_at")
      .eq("created_by", teacherId).eq("role", "student").order("created_at", { ascending: false });
    setStudents(data || []);
  };
  const loadClasses = async (teacherId) => {
    const { data } = await supabase.from("classes").select("id, name").eq("teacher_id", teacherId);
    setClasses(data || []);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      setSession(session);
      loadStudents(session.user.id);
      loadClasses(session.user.id);
    })();
  }, [router]);

  const createStudent = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null); setLoading(true);
    const res = await fetch("/api/teacher/create-student", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error || "登録に失敗しました。"); return; }
    setMsg(`学生「${json.studentCode}」を登録しました。`);
    setForm({ studentCode: "", displayName: "", password: "", classId: "" });
    loadStudents(session.user.id);
  };

  const createClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    await supabase.from("classes").insert({ teacher_id: session.user.id, name: newClassName.trim() });
    setNewClassName("");
    loadClasses(session.user.id);
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>学生登録</div>
          <a href="/teacher/dashboard" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← ダッシュボードへ戻る</a>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>クラス</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {classes.map((c) => <span key={c.id} style={{ fontSize: 12, padding: "4px 10px", border: "1px solid var(--hairline)", borderRadius: R }}>{c.name}</span>)}
            {classes.length === 0 && <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>まだクラスがありません</span>}
          </div>
          <form onSubmit={createClass} style={{ display: "flex", gap: 8 }}>
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="新しいクラス名"
              style={{ flex: 1, padding: "8px 10px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13 }} />
            <button type="submit" style={{ padding: "8px 14px", background: "transparent", border: "1.5px solid var(--ink)", borderRadius: R, fontSize: 13, cursor: "pointer" }}>追加</button>
          </form>
        </div>

        <form onSubmit={createStudent} style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>新しい学生アカウントを発行</div>

          <label style={lbl}>学生ID（ログイン用）</label>
          <input required value={form.studentCode} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} style={inp} placeholder="例: s2026001" />

          <label style={lbl}>氏名</label>
          <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} style={inp} />

          <label style={lbl}>初期パスワード（6文字以上）</label>
          <input required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inp} />

          <label style={lbl}>クラス（任意）</label>
          <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} style={inp}>
            <option value="">未設定</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}>{error}</div>}
          {msg && <div style={{ background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}>{msg}</div>}

          <button type="submit" disabled={loading} style={{ marginTop: 8, width: "100%", padding: "12px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "登録中…" : "アカウントを発行"}
          </button>
        </form>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>登録済みの学生（{students.length}名）</div>
          {students.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--hairline)", fontSize: 13 }}>
              <span>{s.display_name}</span>
              <span style={{ color: "var(--ink-soft)" }}>{s.student_code}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const lbl = { fontSize: 12, color: "var(--ink-soft)", display: "block", marginTop: 12 };
const inp = { width: "100%", padding: "10px 12px", marginTop: 4, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 14 };
