import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import {
  MODE_LABELS, QUIZ_MODES, FLASHCARD_MODES, ALL_MODES, LEVEL_KEYS,
  REVIEW_COUNT_DEFINITION, buildStats, formatDuration, formatDateTime,
} from "../../lib/statsHelpers";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

function pct(correct, total) { return total ? Math.round((correct / total) * 100) : null; }

function toCSV(rows) {
  const header = [
    "学生ID", "氏名", "クラス", "総学習回数", "正答率(%)", "総学習時間(分)", "最終学習日時", "現在のパスワード",
    ...QUIZ_MODES.map((m) => `${MODE_LABELS[m]}_正答率(%)`),
    ...LEVEL_KEYS.flatMap((lv) => QUIZ_MODES.map((m) => `${MODE_LABELS[m]}_${lv}_正答率(%)`)),
    ...LEVEL_KEYS.flatMap((lv) => FLASHCARD_MODES.map((m) => `${MODE_LABELS[m]}_${lv}_回数`)),
    ...LEVEL_KEYS.flatMap((lv) => FLASHCARD_MODES.map((m) => `${MODE_LABELS[m]}_${lv}_時間(分)`)),
  ];
  const lines = [header];
  rows.forEach((r) => {
    const row = [
      r.code, r.name, r.className || "", r.totalReviews, r.accuracy ?? "", Math.round(r.totalSeconds / 60),
      r.lastAt ? formatDateTime(r.lastAt) : "", r.password || "",
      ...QUIZ_MODES.map((m) => r.modeAccuracy[m] ?? ""),
      ...LEVEL_KEYS.flatMap((lv) => QUIZ_MODES.map((m) => r.byModeLevel[m][lv].total ? pct(r.byModeLevel[m][lv].correct, r.byModeLevel[m][lv].total) : "")),
      ...LEVEL_KEYS.flatMap((lv) => FLASHCARD_MODES.map((m) => r.byModeLevel[m][lv].reviews || "")),
      ...LEVEL_KEYS.flatMap((lv) => FLASHCARD_MODES.map((m) => r.byModeLevel[m][lv].seconds ? Math.round(r.byModeLevel[m][lv].seconds / 60) : "")),
    ];
    lines.push(row);
  });
  return lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

function DetailModal({ row, onClose }) {
  if (!row) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 24, maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, fontWeight: 800 }}>{row.name}（{row.code}）</div>
          <button onClick={onClose} style={{ background: "none", border: "1.5px solid var(--ink)", borderRadius: R, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>閉じる</button>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 18 }}>
          クラス：{row.className || "未設定"} ／ 総学習時間：{formatDuration(row.totalSeconds)} ／ 総学習回数：{row.totalReviews} ／ 最終学習：{row.lastAt ? formatDateTime(row.lastAt) : "-"}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>正答率（③④⑤⑥・レベル別）</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
          <thead>
            <tr style={{ background: "var(--indigo)", color: "var(--surface)" }}>
              <th style={th}>レベル</th>
              {QUIZ_MODES.map((m) => <th key={m} style={th}>{MODE_LABELS[m]}</th>)}
            </tr>
          </thead>
          <tbody>
            {LEVEL_KEYS.map((lv) => (
              <tr key={lv} style={{ borderTop: "1px solid var(--hairline)" }}>
                <td style={td}>{lv}</td>
                {QUIZ_MODES.map((m) => {
                  const c = row.byModeLevel[m][lv];
                  return <td key={m} style={td}>{c.total ? `${pct(c.correct, c.total)}%（${c.total}問）` : "-"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>フラッシュカード（①②・レベル別の学習回数と学習時間）</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--indigo)", color: "var(--surface)" }}>
              <th style={th}>レベル</th>
              {FLASHCARD_MODES.map((m) => <th key={m} style={th}>{MODE_LABELS[m]}</th>)}
            </tr>
          </thead>
          <tbody>
            {LEVEL_KEYS.map((lv) => (
              <tr key={lv} style={{ borderTop: "1px solid var(--hairline)" }}>
                <td style={td}>{lv}</td>
                {FLASHCARD_MODES.map((m) => {
                  const c = row.byModeLevel[m][lv];
                  return <td key={m} style={td}>{c.reviews ? `${c.reviews}回 / ${formatDuration(c.seconds)}` : "-"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 14, lineHeight: 1.7 }}>{REVIEW_COUNT_DEFINITION}</div>
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [detailRow, setDetailRow] = useState(null);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }

      const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!me || me.role !== "teacher") { router.replace("/teacher/login"); return; }
      setTeacherName(me.display_name);

      const { data: classList } = await supabase.from("classes").select("id, name").eq("teacher_id", session.user.id);
      setClasses(classList || []);
      const classNameById = new Map((classList || []).map((c) => [c.id, c.name]));

      const { data: students } = await supabase
        .from("profiles")
        .select("id, display_name, student_code, class_id, current_password_plaintext, created_at")
        .eq("created_by", session.user.id)
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (!students || students.length === 0) { setRows([]); setLoading(false); return; }

      const studentIds = students.map((s) => s.id);
      const [{ data: progress }, { data: sessions }, { data: questions }] = await Promise.all([
        supabase.from("progress").select("student_id, question_id, mode, correct, answered_at").in("student_id", studentIds),
        supabase.from("study_sessions").select("student_id, mode, level, items, duration_seconds, started_at").in("student_id", studentIds),
        supabase.from("questions").select("id, level"),
      ]);
      const questionLevelMap = new Map((questions || []).map((q) => [q.id, q.level]));

      const summarized = students.map((s) => {
        const myProgress = (progress || []).filter((p) => p.student_id === s.id);
        const mySessions = (sessions || []).filter((sess) => sess.student_id === s.id);
        const stats = buildStats({ progressRows: myProgress, sessionRows: mySessions, questionLevelMap });

        const modeAccuracy = {};
        QUIZ_MODES.forEach((m) => {
          let total = 0, correct = 0;
          LEVEL_KEYS.forEach((lv) => { total += stats.byModeLevel[m][lv].total; correct += stats.byModeLevel[m][lv].correct; });
          modeAccuracy[m] = pct(correct, total);
        });

        return {
          id: s.id,
          name: s.display_name,
          code: s.student_code,
          className: classNameById.get(s.class_id) || "",
          password: s.current_password_plaintext || "（発行後に再設定された可能性があります）",
          totalReviews: stats.totalReviews,
          accuracy: pct(stats.totalCorrect, stats.totalAnswered),
          totalSeconds: stats.totalStudySeconds,
          lastAt: stats.lastAt,
          modeAccuracy,
          byModeLevel: stats.byModeLevel,
        };
      });
      setRows(summarized);
      setLoading(false);
    })();
  }, [router]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/teacher/login"); };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const displayedRows = useMemo(() => {
    let out = rows;
    if (classFilter) out = out.filter((r) => r.className === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "lastAt") { av = av || ""; bv = bv || ""; }
      if (av === null || av === undefined) av = -1;
      if (bv === null || bv === undefined) bv = -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return out;
  }, [rows, classFilter, search, sortKey, sortDir]);

  const exportCSV = () => {
    const csv = toCSV(displayedRows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kotoba_dojo_progress_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const sortArrow = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 24, fontWeight: 800 }}>教員管理画面</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{teacherName} さん</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/teacher/students" style={navBtn}>学生登録</a>
            <a href="/teacher/upload" style={navBtn}>問題管理（CSV）</a>
            <button onClick={signOut} style={{ ...navBtn, cursor: "pointer" }}>ログアウト</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--ink-soft)" }}>読み込み中…</div>
        ) : rows.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, padding: 32, textAlign: "center", color: "var(--ink-soft)" }}>
            まだ学生が登録されていません。「学生登録」から追加してください。
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <input placeholder="学生ID・氏名で検索" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "8px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13, flex: "1 1 200px" }} />
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                style={{ padding: "8px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13 }}>
                <option value="">全クラス</option>
                {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={() => setShowPasswords((v) => !v)} style={{ padding: "8px 14px", border: "1.5px solid var(--ink)", background: showPasswords ? "var(--ink)" : "transparent", color: showPasswords ? "var(--surface)" : "var(--ink)", borderRadius: R, fontSize: 12, cursor: "pointer" }}>
                {showPasswords ? "パスワードを隠す" : "パスワードを表示"}
              </button>
              <button onClick={exportCSV} style={{ padding: "8px 14px", border: "1.5px solid var(--ink)", background: "var(--ink)", color: "var(--surface)", borderRadius: R, fontSize: 12, cursor: "pointer" }}>
                CSVダウンロード
              </button>
            </div>

            <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--indigo)", color: "var(--surface)" }}>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("code")}>学生ID{sortArrow("code")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("name")}>氏名{sortArrow("name")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("className")}>クラス{sortArrow("className")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("totalReviews")}>総学習回数{sortArrow("totalReviews")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("accuracy")}>正答率{sortArrow("accuracy")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("totalSeconds")}>総学習時間{sortArrow("totalSeconds")}</th>
                    <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("lastAt")}>最終学習日時{sortArrow("lastAt")}</th>
                    {showPasswords && <th style={th}>パスワード</th>}
                    <th style={th}>詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--hairline)" }}>
                      <td style={td}>{r.code}</td>
                      <td style={td}>{r.name}</td>
                      <td style={td}>{r.className || "-"}</td>
                      <td style={td}>{r.totalReviews}</td>
                      <td style={td}>{r.accuracy === null ? "-" : `${r.accuracy}%`}</td>
                      <td style={td}>{formatDuration(r.totalSeconds)}</td>
                      <td style={td}>{r.lastAt ? formatDateTime(r.lastAt) : "-"}</td>
                      {showPasswords && <td style={{ ...td, fontFamily: "monospace" }}>{r.password}</td>}
                      <td style={td}>
                        <button onClick={() => setDetailRow(r)} style={{ padding: "4px 10px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, fontSize: 12, cursor: "pointer" }}>
                          見る
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 12, lineHeight: 1.7 }}>
              {REVIEW_COUNT_DEFINITION}
              　①②のフラッシュカードは正解・不正解の概念がないため、正答率には含まれません（総学習回数・総学習時間には含まれます）。
              　パスワードは学生アカウント発行時または再設定時のものを表示しています（教員アカウントの実メール／パスワードはSupabase Authの仕様上表示できません。パスワードをお忘れの場合はログイン画面の「パスワードをお忘れの方」からメールで再設定してください）。
            </div>
          </>
        )}
      </div>
      <DetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}

const navBtn = { padding: "8px 14px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontSize: 12, fontWeight: 600, textDecoration: "none" };
const th = { textAlign: "left", padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", whiteSpace: "nowrap" };
