import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import {
  MODE_LABELS, QUIZ_MODES, FLASHCARD_MODES, LEVEL_KEYS,
  REVIEW_COUNT_DEFINITION, buildStats, formatDuration, formatDateTime,
} from "../lib/statsHelpers";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const KLEE = "'Klee One', sans-serif";

function pct(correct, total) { return total ? Math.round((correct / total) * 100) : null; }

export default function MyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [className, setClassName] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!me || me.role !== "student") { router.replace("/login"); return; }
      setProfile(me);

      if (me.class_id) {
        const { data: cls } = await supabase.from("classes").select("name").eq("id", me.class_id).single();
        setClassName(cls?.name || "");
      }

      const [progress, sessions, questions] = await Promise.all([
        fetchAllRows(() => supabase.from("progress").select("question_id, mode, correct, answered_at").eq("student_id", session.user.id)),
        fetchAllRows(() => supabase.from("study_sessions").select("mode, level, items, duration_seconds, started_at").eq("student_id", session.user.id)),
        fetchAllRows(() => supabase.from("questions").select("id, level")),
      ]);
      const questionLevelMap = new Map((questions || []).map((q) => [q.id, q.level]));
      setStats(buildStats({ progressRows: progress || [], sessionRows: sessions || [], questionLevelMap }));
      setLoading(false);
    })();
  }, [router]);

  if (loading || !profile || !stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--ink-soft)", fontFamily: KLEE }}>
        読み込み中…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, fontFamily: KLEE }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>マイアカウント</div>
          <a href="/app" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← 学習に戻る</a>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>登録情報</div>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>氏名：{profile.display_name}</div>
            <div>学生ID：{profile.student_code}</div>
            <div>クラス：{className || "未設定"}</div>
            <div>現在のパスワード：<span style={{ fontFamily: "monospace" }}>{profile.current_password_plaintext || "先生に確認してください"}</span></div>
            <div>登録日：{formatDateTime(profile.created_at)}</div>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>学習状況（全体）</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
            <div>総学習回数：<b>{stats.totalReviews}</b></div>
            <div>正答率（③④⑤⑥）：<b>{pct(stats.totalCorrect, stats.totalAnswered) === null ? "-" : `${pct(stats.totalCorrect, stats.totalAnswered)}%`}</b></div>
            <div>総学習時間：<b>{formatDuration(stats.totalStudySeconds)}</b></div>
            <div>最終学習：<b>{stats.lastAt ? formatDateTime(stats.lastAt) : "-"}</b></div>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 20, overflow: "auto" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>正答率（③④⑤⑥・レベル別）</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
                    const c = stats.byModeLevel[m][lv];
                    return <td key={m} style={td}>{c.total ? `${pct(c.correct, c.total)}%（${c.total}問）` : "-"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, overflow: "auto" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>フラッシュカード（①②・レベル別の学習回数と学習時間）</div>
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
                    const c = stats.byModeLevel[m][lv];
                    return <td key={m} style={td}>{c.reviews ? `${c.reviews}回 / ${formatDuration(c.seconds)}` : "-"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 14, lineHeight: 1.7 }}>{REVIEW_COUNT_DEFINITION}</div>
      </div>
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "10px 14px", whiteSpace: "nowrap" };
