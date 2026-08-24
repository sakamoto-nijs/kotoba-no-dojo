import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/fetchAllRows";

const R = "3px";
const LEVEL_KEYS = ["N5", "N4", "N3", "N2", "N1"];
const SET_MAX = 50;
const CATEGORY_OPTIONS = [
  { value: "flashcardReading", label: "①フラッシュカード（読み方）" },
  { value: "flashcardMeaning", label: "②フラッシュカード（意味）" },
  { value: "vocab4", label: "③単語4択問題" },
  { value: "kanji", label: "④漢字読み方入力" },
  { value: "grammar", label: "⑤文法4択問題" },
  { value: "kakitori", label: "⑥漢字書き取り" },
  { value: "vocab4choice", label: "⑦語彙4択問題" },
  { value: "kanji4choice", label: "⑧漢字4択問題" },
  { value: "reading", label: "⑨読解問題" },
  { value: "reorder", label: "⑩並べ替え問題" },
];
// ①②③④は、従来のtype='vocab'も学生画面では合算して表示されるため、件数のカウントもそれに合わせる
const LEGACY_FALLBACK_TYPES = ["flashcardReading", "flashcardMeaning", "vocab4", "kanji"];

export default function QuestionSets() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [category, setCategory] = useState("flashcardReading");
  const [level, setLevel] = useState("N5");
  const [counts, setCounts] = useState({});
  const [names, setNames] = useState({});
  const [originalNames, setOriginalNames] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      setSession(session);
    })();
  }, [router]);

  useEffect(() => {
    if (!session) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, category, level]);

  const loadData = async () => {
    setLoading(true);
    setError(null); setMsg(null);
    try {
      const makeQuery = LEGACY_FALLBACK_TYPES.includes(category)
        ? () => supabase.from("questions").select("set_no").eq("level", level).in("type", ["vocab", category])
        : () => supabase.from("questions").select("set_no").eq("level", level).eq("type", category);
      const qs = await fetchAllRows(makeQuery);
      const c = {};
      (qs || []).forEach((q) => { const n = q.set_no || 1; c[n] = (c[n] || 0) + 1; });
      setCounts(c);

      const nameRows = await fetchAllRows(() =>
        supabase.from("question_set_names").select("set_no, name")
          .eq("teacher_id", session.user.id).eq("type", category).eq("level", level)
      );
      const n = {};
      (nameRows || []).forEach((r) => { n[r.set_no] = r.name; });
      setNames(n);
      setOriginalNames(n);
    } catch (e) {
      setError(`読み込みに失敗しました: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (setNo, value) => {
    setNames((prev) => ({ ...prev, [setNo]: value }));
  };

  const hasChanges = Array.from({ length: SET_MAX }, (_, i) => i + 1)
    .some((n) => (names[n] || "").trim() !== (originalNames[n] || "").trim());

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null); setMsg(null);
    try {
      const toUpsert = [];
      const toDeleteSetNos = [];
      for (let n = 1; n <= SET_MAX; n++) {
        const value = (names[n] || "").trim();
        const original = (originalNames[n] || "").trim();
        if (value === original) continue;
        if (value) {
          toUpsert.push({ teacher_id: session.user.id, type: category, level, set_no: n, name: value, updated_at: new Date().toISOString() });
        } else if (original) {
          toDeleteSetNos.push(n);
        }
      }
      if (toUpsert.length) {
        const { error: upErr } = await supabase.from("question_set_names").upsert(toUpsert, { onConflict: "teacher_id,type,level,set_no" });
        if (upErr) throw upErr;
      }
      if (toDeleteSetNos.length) {
        const { error: delErr } = await supabase.from("question_set_names").delete()
          .eq("teacher_id", session.user.id).eq("type", category).eq("level", level).in("set_no", toDeleteSetNos);
        if (delErr) throw delErr;
      }
      setOriginalNames(names);
      setMsg("保存しました。");
    } catch (e) {
      setError(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>問題セット</div>
          <a href="/teacher/dashboard" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← ダッシュボードへ戻る</a>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, lineHeight: 1.8 }}>
          学生画面では「カテゴリー→レベル」を選んだ後、さらにこの「セット」ごとに問題を絞り込んで練習できます。ここでは各セットに任意の名前をつけられます（名前をつけなければ、番号だけが表示されます）。どの問題をどのセットに入れるかは、CSVアップロード時のset_no列（1〜50）で指定します。
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={selectStyle}>
            {LEVEL_KEYS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
          </select>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}
        {msg && <div style={msgBoxStyle}>{msg}</div>}

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--ink-soft)", padding: "40px 0" }}>読み込み中…</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {Array.from({ length: SET_MAX }, (_, i) => i + 1).map((n) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, background: counts[n] ? "var(--surface)" : "transparent" }}>
                  <div style={{ width: 28, textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{n}</div>
                  <input
                    type="text"
                    value={names[n] || ""}
                    onChange={(e) => handleNameChange(n, e.target.value)}
                    placeholder="（名称未設定）"
                    style={{ flex: 1, padding: "6px 10px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: counts[n] ? "var(--ink-soft)" : "var(--ink-faint)", minWidth: 44, textAlign: "right" }}>
                    {counts[n] || 0}問
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", bottom: 16 }}>
              <button
                onClick={handleSaveAll}
                disabled={!hasChanges || saving}
                style={{ padding: "10px 24px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 13, cursor: hasChanges && !saving ? "pointer" : "not-allowed", opacity: hasChanges && !saving ? 1 : 0.5, boxShadow: "0 2px 0 rgba(36,31,26,0.10)" }}
              >
                {saving ? "保存中…" : "保存する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const selectStyle = { padding: "8px 12px", border: "1.5px solid var(--ink)", borderRadius: R, fontSize: 13, background: "var(--surface)" };
const errorBoxStyle = { background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 };
const msgBoxStyle = { background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 };
