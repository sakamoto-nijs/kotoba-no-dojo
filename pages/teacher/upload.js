import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Papa from "papaparse";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const LEVEL_KEYS = ["N5", "N4", "N3", "N2", "N1"];

// type: vocab / grammar / kakitori の3種類に対応。
// kakitori（漢字書き取り）は word 列に「単漢字」を入れる運用にしています。
function parseCSVText(text) {
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = [];
  const problems = [];

  result.data.forEach((row, idx) => {
    const type = (row.type || "").trim();
    let level = (row.level || "").trim().toUpperCase();
    if (!LEVEL_KEYS.includes(level)) {
      if (level) problems.push(`${idx + 2}行目: levelはN5〜N1にしてください → N5として扱いました`);
      level = "N5";
    }

    if (type === "vocab" || type === "kakitori") {
      if (!row.word || !row.reading) { problems.push(`${idx + 2}行目: word/readingが空です`); return; }
      rows.push({
        type, level,
        word: row.word.trim(),
        reading: row.reading.trim(),
        meaning: (row.meaning || "").trim(),
        meaning_en: (row.meaning_en || "").trim(),
        example: (row.example || "").trim(),
        char: type === "kakitori" ? row.word.trim() : null,
      });
    } else if (type === "grammar") {
      const choices = [row.choice1, row.choice2, row.choice3, row.choice4].map((c) => (c || "").trim());
      const answerNum = parseInt(row.answer, 10);
      if (!row.blank || choices.some((c) => !c) || !answerNum || answerNum < 1 || answerNum > 4) {
        problems.push(`${idx + 2}行目: 文法問題のデータが不完全です`); return;
      }
      rows.push({ type, level, blank: row.blank.trim(), choice1: choices[0], choice2: choices[1], choice3: choices[2], choice4: choices[3], answer: answerNum });
    } else if (type) {
      problems.push(`${idx + 2}行目: typeはvocab/grammar/kakitoriのいずれかにしてください`);
    }
  });
  return { rows, problems };
}

const TEMPLATE = `type,level,word,reading,meaning,meaning_en,example,blank,choice1,choice2,choice3,choice4,answer
vocab,N4,食事,しょくじ,食べること,meal,家族と食事をします。,,,,,,
grammar,N3,,,,,,この駅___乗り換えます。,で,に,を,が,1
kakitori,N5,学,がく,学ぶこと・学問,,,,,,,,
`;

export default function TeacherUpload() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [existingCount, setExistingCount] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      setSession(session);
      const { count } = await supabase.from("questions").select("id", { count: "exact", head: true });
      setExistingCount(count ?? 0);
    })();
  }, [router]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file, "UTF-8");
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kotoba_dojo_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const doUpload = async () => {
    setError(null); setMsg(null);
    if (!text.trim()) { setError("CSVデータが空です。"); return; }
    const { rows, problems } = parseCSVText(text);
    if (rows.length === 0) { setError("有効なデータが見つかりませんでした。"); return; }

    setLoading(true);
    const withCreator = rows.map((r) => ({ ...r, created_by: session.user.id }));
    const { error: insertErr } = await supabase.from("questions").insert(withCreator);
    setLoading(false);
    if (insertErr) { setError(`取り込みに失敗しました: ${insertErr.message}`); return; }

    setMsg(`取り込み完了：${rows.length}件を追加しました${problems.length ? `（注意${problems.length}件）` : ""}。学生側の「ことばの道場」に反映されます。`);
    setText(""); setFileName(null);
    const { count } = await supabase.from("questions").select("id", { count: "exact", head: true });
    setExistingCount(count ?? 0);
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>問題管理（CSV）</div>
          <a href="/teacher/dashboard" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← ダッシュボードへ戻る</a>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
          現在の問題数：{existingCount === null ? "…" : `${existingCount}件`}
        </div>

        <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>ExcelでCSV UTF-8として保存したファイルを選ぶか、貼り付けてください</div>
            <button onClick={downloadTemplate} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, whiteSpace: "nowrap", cursor: "pointer" }}>テンプレート</button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1.5px dashed var(--ink-faint)", borderRadius: R, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
            {fileName || "CSVファイルを選択"}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
          </label>

          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder="type,level,word,reading,meaning,meaning_en,example,blank,choice1,choice2,choice3,choice4,answer"
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 12, fontFamily: "monospace" }} />

          {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginTop: 12 }}>{error}</div>}
          {msg && <div style={{ background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginTop: 12 }}>{msg}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={doUpload} disabled={loading} style={{ padding: "10px 20px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "取り込み中…" : "取り込む"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.8, marginTop: 16 }}>
          <div><b>type</b>: vocab（単語）／ grammar（文法）／ kakitori（漢字書き取り・単漢字）</div>
          <div><b>kakitori行</b>は word 列に単漢字を1文字入れてください（例: 学）</div>
        </div>
      </div>
    </div>
  );
}
