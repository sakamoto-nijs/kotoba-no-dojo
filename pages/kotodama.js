import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import { buildStats, formatDuration } from "../lib/statsHelpers";
import { computeKotodamaStats, buildCreatureSVG, STAGE_LABELS, CATEGORY_LABELS } from "../lib/kotodama";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const KLEE = "'Klee One', sans-serif";
const SERIF = "'Shippori Mincho', serif";

export default function KotodamaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const [kotodama, setKotodama] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (!me || me.role !== "student") { router.replace("/login"); return; }

      const [progress, sessions] = await Promise.all([
        fetchAllRows(() => supabase.from("progress").select("mode, correct, elapsed_seconds, question_id, answered_at").eq("student_id", session.user.id)),
        fetchAllRows(() => supabase.from("study_sessions").select("mode, level, items, duration_seconds, started_at").eq("student_id", session.user.id)),
      ]);

      setTotalStudySeconds(buildStats({ progressRows: progress || [], sessionRows: sessions || [] }).totalStudySeconds);
      setKotodama(computeKotodamaStats({ progressRows: progress || [], sessionRows: sessions || [] }));
      setLoading(false);
    })();
  }, [router]);

  if (loading || !kotodama) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--ink-soft)", fontFamily: KLEE }}>
        読み込み中…
      </div>
    );
  }

  const { categories, level, xpIntoLevel, xpNeeded, stage } = kotodama;
  const maxCat = Math.max(1, categories.kanji, categories.vocab, categories.grammar);
  const barColor = { kanji: "var(--vermilion)", vocab: "var(--indigo)", grammar: "var(--moss)" };

  return (
    <div style={{ minHeight: "100vh", padding: 24, fontFamily: KLEE }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 800 }}>ことだま育成</div>
          <a href="/app" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)", background: "transparent", border: "1.5px solid var(--ink)", borderRadius: R, padding: "7px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            <span>戻る <span style={{ fontWeight: 500, opacity: 0.85 }}>/ Go back to Home</span></span>
          </a>
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: "26px 22px 22px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, var(--vermilion), var(--star))" }} />

          <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 2 }}>{STAGE_LABELS[stage - 1]}</div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 210 }}>
            <div dangerouslySetInnerHTML={{ __html: buildCreatureSVG(stage) }} />
          </div>
          <div style={{ textAlign: "center", marginTop: 2 }}>
            <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700 }}>ことだま</span>
            <span style={{ marginLeft: 8, fontSize: 13, color: "var(--vermilion)", fontWeight: 700, border: "1px solid var(--vermilion)", borderRadius: 2, padding: "1px 7px" }}>
              {level >= 100 ? "Lv. 100 (MAX)" : `Lv. ${level}`}
            </span>
          </div>

          <div style={{ margin: "16px 0 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
              <span>{xpIntoLevel} / {xpNeeded} XP</span>
              <span>{level >= 100 ? "最大レベルに到達" : `次のレベルまで ${xpNeeded - xpIntoLevel}`}</span>
            </div>
            <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--hairline)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, var(--indigo), var(--vermilion))", width: `${Math.min(100, (xpIntoLevel / xpNeeded) * 100)}%` }} />
            </div>
          </div>

          <div style={{ marginTop: 14, background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: R, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>総学習時間</span>
            <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700 }}>{formatDuration(totalStudySeconds)}</span>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--hairline)", margin: "20px 0 16px" }} />
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>カテゴリ別の修行量（XP）</div>
          {["kanji", "vocab", "grammar"].map((cat) => (
            <div key={cat} style={{ display: "grid", gridTemplateColumns: "48px 1fr 34px", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: "var(--ink-soft)" }}>{CATEGORY_LABELS[cat]}</span>
              <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: barColor[cat], width: `${(categories[cat] / maxCat) * 100}%` }} />
              </div>
              <span style={{ textAlign: "right", color: "var(--ink-soft)" }}>{categories[cat]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
