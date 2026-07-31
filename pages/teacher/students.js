import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Papa from "papaparse";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

const BULK_TEMPLATE = `studentCode,displayName,password,className
s2026001,山田太郎,pass1234,クラスA
s2026002,山田花子,pass5678,クラスA
`;

function ResetPasswordModal({ student, onClose, session, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  if (!student) return null;

  const submit = async () => {
    if (newPassword.length < 6) { setError("パスワードは6文字以上にしてください。"); return; }
    setError(null); setLoading(true);
    const res = await fetch("/api/teacher/reset-student-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studentId: student.id, newPassword }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error || "再設定に失敗しました。"); return; }
    onDone(newPassword);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 24, maxWidth: 360, width: "100%" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{student.display_name}（{student.student_code}）</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>新しいパスワードを設定します</div>
        <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新しいパスワード（6文字以上）"
          style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 14, marginBottom: 12 }} />
        {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, cursor: "pointer", fontSize: 13 }}>キャンセル</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, padding: "10px", border: "1.5px solid var(--ink)", background: "var(--ink)", color: "var(--surface)", borderRadius: R, cursor: "pointer", fontSize: 13 }}>
            {loading ? "設定中…" : "設定する"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [resetTarget, setResetTarget] = useState(null);
  const [showPasswords, setShowPasswords] = useState(false);

  const [bulkText, setBulkText] = useState("");
  const [bulkFileName, setBulkFileName] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const bulkFileRef = useRef(null);

  const classNameById = (id) => classes.find((c) => c.id === id)?.name || "";

  const loadStudents = async (teacherId) => {
    const { data } = await supabase.from("profiles").select("id, display_name, student_code, class_id, current_password_plaintext, created_at")
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

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + BULK_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kotoba_dojo_students_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setBulkText(ev.target.result);
    reader.readAsText(file, "UTF-8");
  };

  const doBulkUpload = async () => {
    setBulkResults(null);
    if (!bulkText.trim()) return;
    const parsed = Papa.parse(bulkText.trim(), { header: true, skipEmptyLines: true });
    const rowsToSend = parsed.data.map((r) => ({
      studentCode: (r.studentCode || "").trim(),
      displayName: (r.displayName || "").trim(),
      password: (r.password || "").trim(),
      className: (r.className || "").trim(),
    }));
    if (rowsToSend.length === 0) return;
    setBulkLoading(true);
    const res = await fetch("/api/teacher/bulk-create-students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ students: rowsToSend }),
    });
    const json = await res.json();
    setBulkLoading(false);
    setBulkResults(json.results || [{ ok: false, error: json.error || "取り込みに失敗しました。" }]);
    setBulkText(""); setBulkFileName(null);
    loadStudents(session.user.id);
    loadClasses(session.user.id);
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
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
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>新しい学生アカウントを1件だけ発行</div>

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

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>複数の学生をCSVで一括登録</div>
            <button onClick={downloadTemplate} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, cursor: "pointer" }}>テンプレート</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            列は <code>studentCode,displayName,password,className</code>。classNameが未登録の場合は自動で新しいクラスとして作成されます（任意項目）。
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1.5px dashed var(--ink-faint)", borderRadius: R, fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
            {bulkFileName || "CSVファイルを選択"}
            <input ref={bulkFileRef} type="file" accept=".csv,text/csv" onChange={handleBulkFile} style={{ display: "none" }} />
          </label>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5}
            placeholder="studentCode,displayName,password,className"
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 12, fontFamily: "monospace", marginBottom: 10 }} />
          <button onClick={doBulkUpload} disabled={bulkLoading} style={{ padding: "10px 20px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 13, cursor: bulkLoading ? "not-allowed" : "pointer" }}>
            {bulkLoading ? "登録中…" : "一括登録する"}
          </button>

          {bulkResults && (
            <div style={{ marginTop: 14, fontSize: 12 }}>
              {bulkResults.map((r, i) => (
                <div key={i} style={{ padding: "4px 0", color: r.ok ? "var(--moss)" : "var(--vermilion-deep)" }}>
                  {r.row ? `${r.row}行目 ` : ""}{r.studentCode || ""}：{r.ok ? "登録完了" : `失敗（${r.error}）`}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>登録済みの学生（{students.length}名）</div>
            <button onClick={() => setShowPasswords((v) => !v)} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--ink)", background: showPasswords ? "var(--ink)" : "transparent", color: showPasswords ? "var(--surface)" : "var(--ink)", borderRadius: R, cursor: "pointer" }}>
              {showPasswords ? "パスワードを隠す" : "パスワードを表示"}
            </button>
          </div>
          {students.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--hairline)", fontSize: 13, gap: 10, flexWrap: "wrap" }}>
              <div>
                <div>{s.display_name} <span style={{ color: "var(--ink-soft)" }}>（{s.student_code}）</span></div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                  {classNameById(s.class_id) || "クラス未設定"}
                  {showPasswords && <> ／ パスワード：<span style={{ fontFamily: "monospace" }}>{s.current_password_plaintext || "不明（再設定してください）"}</span></>}
                </div>
              </div>
              <button onClick={() => setResetTarget(s)} style={{ fontSize: 11, padding: "4px 10px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, cursor: "pointer" }}>
                パスワード再設定
              </button>
            </div>
          ))}
        </div>
      </div>

      <ResetPasswordModal
        student={resetTarget}
        session={session}
        onClose={() => setResetTarget(null)}
        onDone={() => loadStudents(session.user.id)}
      />
    </div>
  );
}

const lbl = { fontSize: 12, color: "var(--ink-soft)", display: "block", marginTop: 12 };
const inp = { width: "100%", padding: "10px 12px", marginTop: 4, border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 14 };
