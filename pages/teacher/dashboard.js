import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const MODE_LABELS = {
  flashcardReading: "①読み方カード",
  flashcardMeaning: "②意味カード",
  vocab4: "③単語4択",
  kanji: "④漢字読み",
  grammar4: "⑤文法穴埋め",
  kakitori: "⑥書き取り",
};

export default function TeacherDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [rows, setRows] = useState([]); // 学生ごとの集計行

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }

      const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!me || me.role !== "teacher") { router.replace("/teacher/login"); return; }
      setTeacherName(me.display_name);

      const { data: students } = await supabase
        .from("profiles")
        .select("id, display_name, student_code, created_at")
        .eq("created_by", session.user.id)
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (!students || students.length === 0) { setRows([]); setLoading(false); return; }

      const studentIds = students.map((s) => s.id);
      const { data: progress } = await supabase
        .from("progress")
        .select("student_id, mode, correct, answered_at")
        .in("student_id", studentIds);

      const summarized = students.map((s) => {
        const mine = (progress || []).filter((p) => p.student_id === s.id);
        const total = mine.length;
        const correct = mine.filter((p) => p.correct).length;
        const lastAt = mine.length ? mine.reduce((a, b) => (a.answered_at > b.answered_at ? a : b)).answered_at : null;
        const byMode = {};
        Object.keys(MODE_LABELS).forEach((m) => {
          const modeRows = mine.filter((p) => p.mode === m);
          byMode[m] = modeRows.length
            ? Math.round((modeRows.filter((p) => p.correct).length / modeRows.length) * 100)
            : null;
        });
        return {
          id: s.id,
          name: s.display_name,
          code: s.student_code,
          total,
          pct: total ? Math.round((correct / total) * 100) : null,
          lastAt,
          byMode,
        };
      });
      setRows(summarized);
      setLoading(false);
    })();
  }, [router]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/teacher/login"); };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 24, fontWeight: 800 }}>教員管理画面</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{teacherName} さん</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/teacher/students" style={navBtn}>学生登録</a>
            <a href="/teacher/upload" style={navBtn}>問題管理（CSV）</a>
            <button onClick={signOut} style={{ ...navBtn, background: "none", cursor: "pointer" }}>ログアウト</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--ink-soft)" }}>読み込み中…</div>
        ) : rows.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, padding: 32, textAlign: "center", color: "var(--ink-soft)" }}>
            まだ学生が登録されていません。「学生登録」から追加してください。
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--indigo)", color: "var(--surface)" }}>
                  <th style={th}>学生ID</th>
                  <th style={th}>氏名</th>
                  <th style={th}>総回答数</th>
                  <th style={th}>正答率</th>
                  {Object.values(MODE_LABELS).map((label) => <th key={label} style={th}>{label}</th>)}
                  <th style={th}>最終学習</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--hairline)" }}>
                    <td style={td}>{r.code}</td>
                    <td style={td}>{r.name}</td>
                    <td style={td}>{r.total}</td>
                    <td style={td}>{r.pct === null ? "-" : `${r.pct}%`}</td>
                    {Object.keys(MODE_LABELS).map((m) => (
                      <td key={m} style={td}>{r.byMode[m] === null ? "-" : `${r.byMode[m]}%`}</td>
                    ))}
                    <td style={td}>{r.lastAt ? new Date(r.lastAt).toLocaleDateString("ja-JP") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn = { padding: "8px 14px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontSize: 12, fontWeight: 600, textDecoration: "none" };
const th = { textAlign: "left", padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", whiteSpace: "nowrap" };
