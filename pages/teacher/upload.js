import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Papa from "papaparse";
import { supabase } from "../../lib/supabaseClient";
import { MODE_LABELS, formatDateTime } from "../../lib/statsHelpers";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const LEVEL_KEYS = ["N5", "N4", "N3", "N2", "N1"];
const TYPE_LABELS = {
  vocab: "単語（共通）",
  flashcardReading: "単語（①専用）",
  flashcardMeaning: "単語（②専用）",
  vocab4: "単語（③専用）",
  kanji: "単語（④専用）",
  grammar: "文法",
  kakitori: "漢字書き取り",
  vocab4choice: "語彙4択",
  kanji4choice: "漢字4択",
  reading: "読解",
  reorder: "並べ替え",
};
const WORD_BASED_TYPES = ["vocab", "flashcardReading", "flashcardMeaning", "vocab4", "kanji"];
const VALID_TYPES = [...WORD_BASED_TYPES, "grammar", "kakitori", "vocab4choice", "kanji4choice", "reading", "reorder"];
const READING_Q_MAX = 5;
const REORDER_CARD_MAX = 6;
const REORDER_CARD_MIN = 3;

// blank・choice1〜4・answerを使う4択形式のバリデーション（grammar / vocab4choice / kanji4choiceで共通）
function parseBlankChoiceRow(row, type, level, idx, problems) {
  const choices = [row.choice1, row.choice2, row.choice3, row.choice4].map((c) => (c || "").trim());
  const answerNum = parseInt(row.answer, 10);
  const label = TYPE_LABELS[type] || type;
  if (!row.blank || choices.some((c) => !c) || !answerNum || answerNum < 1 || answerNum > 4) {
    problems.push(`${idx + 2}行目: ${label}問題のデータが不完全です（blank・choice1〜4・answerを確認してください）`);
    return null;
  }
  return { type, level, blank: row.blank.trim(), choice1: choices[0], choice2: choices[1], choice3: choices[2], choice4: choices[3], answer: answerNum };
}

// type: vocab（従来型・①②③④共通）/ flashcardReading（①専用）/ flashcardMeaning（②専用）/
//       vocab4（③専用）/ kanji（④専用）/ grammar / kakitori / vocab4choice / kanji4choice / reading / reorder に対応。
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

    if (WORD_BASED_TYPES.includes(type) || type === "kakitori") {
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
    } else if (type === "grammar" || type === "vocab4choice" || type === "kanji4choice") {
      const parsed = parseBlankChoiceRow(row, type, level, idx, problems);
      if (parsed) rows.push(parsed);
    } else if (type === "reading") {
      if (!row.passage || !row.passage.trim()) { problems.push(`${idx + 2}行目: passageが空です`); return; }
      const readingQuestions = [];
      for (let q = 1; q <= READING_Q_MAX; q++) {
        const qText = (row[`q${q}`] || "").trim();
        if (!qText) continue;
        const choices = [row[`q${q}_choice1`], row[`q${q}_choice2`], row[`q${q}_choice3`], row[`q${q}_choice4`]].map((c) => (c || "").trim());
        const answerNum = parseInt(row[`q${q}_answer`], 10);
        if (choices.some((c) => !c) || !answerNum || answerNum < 1 || answerNum > 4) {
          problems.push(`${idx + 2}行目: q${q}の選択肢・正解番号が不完全なためq${q}をスキップしました`);
          continue;
        }
        readingQuestions.push({ question: qText, choice1: choices[0], choice2: choices[1], choice3: choices[2], choice4: choices[3], answer: answerNum });
      }
      if (readingQuestions.length === 0) { problems.push(`${idx + 2}行目: 読解問題には設問（q1〜q5）が少なくとも1つ必要です`); return; }
      rows.push({ type, level, passage: row.passage.trim(), reading_questions: readingQuestions });
    } else if (type === "reorder") {
      if (!row.blank || !row.blank.trim()) { problems.push(`${idx + 2}行目: blank（___を含む例文）が空です`); return; }
      const cards = [];
      for (let c = 1; c <= REORDER_CARD_MAX; c++) {
        const w = (row[`card${c}`] || "").trim();
        if (w) cards.push(w);
      }
      if (cards.length < REORDER_CARD_MIN) {
        problems.push(`${idx + 2}行目: 並べ替え問題はcard1〜card6のうち最低${REORDER_CARD_MIN}枚が必要です`);
        return;
      }
      rows.push({ type, level, blank: row.blank.trim(), cards });
    } else if (type) {
      problems.push(`${idx + 2}行目: typeは${VALID_TYPES.join("/")}のいずれかにしてください`);
    }
  });
  return { rows, problems };
}

const TEMPLATE = `type,level,word,reading,meaning,meaning_en,example,blank,choice1,choice2,choice3,choice4,answer,passage,q1,q1_choice1,q1_choice2,q1_choice3,q1_choice4,q1_answer,q2,q2_choice1,q2_choice2,q2_choice3,q2_choice4,q2_answer,q3,q3_choice1,q3_choice2,q3_choice3,q3_choice4,q3_answer,q4,q4_choice1,q4_choice2,q4_choice3,q4_choice4,q4_answer,q5,q5_choice1,q5_choice2,q5_choice3,q5_choice4,q5_answer,card1,card2,card3,card4,card5,card6
flashcardReading,N4,食事,しょくじ,食べること,meal,家族と食事(しょくじ)をします。,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
flashcardMeaning,N4,食事,しょくじ,食べること,meal,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
vocab4,N4,食事,しょくじ,食べること,meal,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
kanji,N4,食事,しょくじ,食べること,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
grammar,N3,,,,,,この駅___乗り換(のりか)えます。,で,に,を,が,1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
kakitori,N5,学,がく,学ぶこと・学問,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
vocab4choice,N4,,,,,,「食べる」の意味として正しいものを選びなさい。,食事をする,外に出る,本を読む,友達と話す,1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
kanji4choice,N5,,,,,,「学校(がっこう)」の読み方として正しいものを選びなさい。,がっこう,がくこう,かっこう,がっごう,1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
reading,N5,,,,,,,,,,,,私は毎朝七時(しちじ)に起(お)きます。学校(がっこう)では友達と日本語を勉強(べんきょう)します。,「私」は何時に起きますか。,七時,六時,八時,九時,1,誰と勉強しますか。,先生,友達,家族,一人,2,,,,,,,,,,,,,,,,,,,,,,,,
reorder,N5,,,,,,私は___。,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,教室(きょうしつ)で,日本語,を,勉強(べんきょう)する,,
`;
function stripBOM(text) {
  return (text || "").replace(/^\uFEFF/, "");
}

function triggerDownload(csvText, filename) {
  const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function safeFileToken(s) {
  return (s || "gakushu_kiroku").replace(/[^\w\-一-龠ぁ-んァ-ヶー]/g, "_").slice(0, 40);
}

function toProgressBackupCSV(rows) {
  const header = ["学生ID", "氏名", "種類", "レベル", "問題", "モード", "正誤", "お気に入り", "解答日時"];
  const lines = [header];
  rows.forEach((r) => {
    const q = r.questions || {};
    const student = r.profiles || {};
    const questionSummary = q.type === "reading" ? (q.passage ? q.passage.slice(0, 30) + (q.passage.length > 30 ? "…" : "") : "") : (q.blank || q.word || "");
    lines.push([
      student.student_code || "",
      student.display_name || "",
      TYPE_LABELS[q.type] || q.type || "",
      q.level || "",
      questionSummary,
      MODE_LABELS[r.mode] || r.mode || "",
      r.correct ? "正解" : "不正解",
      r.favorited ? "★" : "",
      formatDateTime(r.answered_at),
    ]);
  });
  return lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

// 削除される予定の問題に紐づく学習記録を、削除前にCSVとして自動ダウンロードする。
// （progressテーブルは questions を外部キーで参照しており、questions削除時にcascadeで消えるため）
async function backupProgressForQuestionIds(ids, filenameHint) {
  if (!ids || ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("progress")
    .select("correct, favorited, answered_at, mode, question_id, questions(type, level, word, blank, passage), profiles(student_code, display_name)")
    .in("question_id", ids);
  if (error) throw error;
  if (!data || data.length === 0) return 0;
  const csv = toProgressBackupCSV(data);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  triggerDownload(csv, `gakushu_kiroku_backup_${safeFileToken(filenameHint)}_${stamp}.csv`);
  return data.length;
}

function ConfirmModal({ info, busy, onCancel, onConfirm }) {
  if (!info) return null;
  return (
    <div onClick={busy ? undefined : onCancel} style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 24, maxWidth: 480, width: "100%" }}>
        <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 18, fontWeight: 800, marginBottom: 12, color: "var(--vermilion-deep)" }}>{info.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--ink)", marginBottom: 20, whiteSpace: "pre-wrap" }}>{info.body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={{ padding: "9px 16px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, fontSize: 13, cursor: busy ? "not-allowed" : "pointer" }}>キャンセル</button>
          <button onClick={onConfirm} disabled={busy} style={{ padding: "9px 16px", border: "1.5px solid var(--vermilion)", background: "var(--vermilion)", color: "var(--surface)", borderRadius: R, fontWeight: 700, fontSize: 13, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "処理中…" : info.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeacherUpload() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [existingCount, setExistingCount] = useState(null);
  const [mode, setMode] = useState("add"); // 'add' | 'replace'
  const [uploads, setUploads] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(null); // {title, body, confirmLabel, onConfirm}
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [batchBusyId, setBatchBusyId] = useState(null);
  const fileRef = useRef(null);

  const loadExistingCount = async () => {
    const { count } = await supabase.from("questions").select("id", { count: "exact", head: true });
    setExistingCount(count ?? 0);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data, error: histErr } = await supabase
      .from("csv_uploads")
      .select("*")
      .order("created_at", { ascending: false });
    if (!histErr) setUploads(data || []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      setSession(session);
      await Promise.all([loadExistingCount(), loadHistory()]);
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
    triggerDownload(TEMPLATE, "kotoba_dojo_template.csv");
  };

  const doAddOnly = async (rows, problems) => {
    setLoading(true);
    const { data: uploadRec, error: upErr } = await supabase
      .from("csv_uploads")
      .insert({ teacher_id: session.user.id, file_name: fileName || "(貼り付け)", mode: "add", row_count: rows.length, raw_csv: text })
      .select().single();
    if (upErr) { setLoading(false); setError(`アップロード履歴の記録に失敗しました: ${upErr.message}`); return; }

    const withCreator = rows.map((r) => ({ ...r, created_by: session.user.id, upload_id: uploadRec.id }));
    const { error: insertErr } = await supabase.from("questions").insert(withCreator);
    setLoading(false);
    if (insertErr) {
      await supabase.from("csv_uploads").delete().eq("id", uploadRec.id); // ロールバック
      setError(`取り込みに失敗しました: ${insertErr.message}`);
      return;
    }

    setMsg(`取り込み完了：${rows.length}件を追加しました${problems.length ? `（注意${problems.length}件）` : ""}。学生側の「ことばの道場」に反映されます。`);
    setText(""); setFileName(null);
    await Promise.all([loadExistingCount(), loadHistory()]);
  };

  const doReplaceAll = async (rows, problems) => {
    setConfirmBusy(true);
    setLoading(true);
    try {
      const { data: existingQs, error: exErr } = await supabase.from("questions").select("id");
      if (exErr) throw exErr;
      const existingIds = (existingQs || []).map((q) => q.id);

      let backedUpCount = 0;
      if (existingIds.length) {
        backedUpCount = await backupProgressForQuestionIds(existingIds, "zenbu_sakujo");
      }

      // 削除前に、既存のアップロード履歴を「削除済み」として記録しておく
      await supabase.from("csv_uploads").update({ deleted_at: new Date().toISOString() }).is("deleted_at", null);

      if (existingIds.length) {
        const { error: delErr } = await supabase.from("questions").delete().in("id", existingIds);
        if (delErr) throw delErr;
      }

      const { data: uploadRec, error: upErr } = await supabase
        .from("csv_uploads")
        .insert({ teacher_id: session.user.id, file_name: fileName || "(貼り付け)", mode: "replace", row_count: rows.length, raw_csv: text })
        .select().single();
      if (upErr) throw upErr;

      const withCreator = rows.map((r) => ({ ...r, created_by: session.user.id, upload_id: uploadRec.id }));
      const { error: insErr } = await supabase.from("questions").insert(withCreator);
      if (insErr) throw insErr;

      setMsg(`新規置き換え完了：既存の${existingIds.length}件を削除し、${rows.length}件を新たに追加しました。${backedUpCount > 0 ? `削除された問題に紐づく学習記録${backedUpCount}件を、バックアップ用CSVとして自動ダウンロードしました。` : ""}${problems.length ? `（注意${problems.length}件）` : ""}`);
      setText(""); setFileName(null);
      await Promise.all([loadExistingCount(), loadHistory()]);
    } catch (e) {
      setError(`処理に失敗しました: ${e.message || e}`);
    } finally {
      setLoading(false);
      setConfirmBusy(false);
      setConfirmInfo(null);
    }
  };

  const doUpload = async () => {
    setError(null); setMsg(null);
    if (!text.trim()) { setError("CSVデータが空です。"); return; }
    const { rows, problems } = parseCSVText(text);
    if (rows.length === 0) { setError("有効なデータが見つかりませんでした。"); return; }

    if (mode === "replace" && (existingCount ?? 0) > 0) {
      setConfirmInfo({
        title: "既存の問題をすべて削除しますか？",
        body: `現在登録されている問題 ${existingCount}件をすべて削除し、代わりに新しい${rows.length}件を追加します。\n\nこの操作は元に戻せません。削除される問題に紐づく学習記録（正誤・お気に入りなど）は、実行前に自動でCSVとしてダウンロードされます。`,
        confirmLabel: "削除して新規に追加する",
        onConfirm: () => doReplaceAll(rows, problems),
      });
      return;
    }
    if (mode === "replace") {
      await doReplaceAll(rows, problems);
      return;
    }
    await doAddOnly(rows, problems);
  };

  const handleDownloadHistory = (upload) => {
    triggerDownload(stripBOM(upload.raw_csv), upload.file_name || `kotoba_dojo_upload_${upload.id}.csv`);
  };

  const doFullReset = async () => {
    setConfirmBusy(true);
    setLoading(true);
    try {
      const { data: existingQs, error: exErr } = await supabase.from("questions").select("id");
      if (exErr) throw exErr;
      const existingIds = (existingQs || []).map((q) => q.id);

      // 1. 削除される問題に紐づく学習記録を、削除前にバックアップCSVとしてダウンロード
      let backedUpCount = 0;
      if (existingIds.length) {
        backedUpCount = await backupProgressForQuestionIds(existingIds, "zenbu_reset");
      }

      // 2. これまでアップロードした全CSVの履歴も、削除前にそれぞれダウンロード
      //    （ブラウザが連続ダウンロードをブロックしないよう、少し間隔をあけて実行する）
      for (let i = 0; i < uploads.length; i++) {
        handleDownloadHistory(uploads[i]);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      // 3. 問題データを全削除
      if (existingIds.length) {
        const { error: delErr } = await supabase.from("questions").delete().in("id", existingIds);
        if (delErr) throw delErr;
      }

      // 4. アップロード履歴も全削除（「新規に追加」と違い、履歴自体を空にする）
      const { error: histDelErr } = await supabase.from("csv_uploads").delete().eq("teacher_id", session.user.id);
      if (histDelErr) throw histDelErr;

      setMsg(`全リセット完了：問題${existingIds.length}件・アップロード履歴${uploads.length}件をすべて削除しました。${backedUpCount > 0 ? `学習記録${backedUpCount}件をバックアップ用CSVとして自動ダウンロードしました。` : ""}${uploads.length > 0 ? `過去にアップロードしたCSV ${uploads.length}件もあわせてダウンロードしました。` : ""}`);
      setText(""); setFileName(null);
      await Promise.all([loadExistingCount(), loadHistory()]);
    } catch (e) {
      setError(`リセットに失敗しました: ${e.message || e}`);
    } finally {
      setLoading(false);
      setConfirmBusy(false);
      setConfirmInfo(null);
    }
  };

  const handleFullResetClick = () => {
    setError(null); setMsg(null);
    setConfirmInfo({
      title: "すべての問題とアップロード履歴をリセットしますか？",
      body: `現在登録されている問題 ${existingCount ?? 0}件と、アップロード履歴 ${uploads.length}件を、すべて削除して何も登録されていない状態に戻します。\n\nこの操作は元に戻せません。実行前に、削除される問題に紐づく学習記録と、これまでアップロードしたCSV（${uploads.length}件）が自動でダウンロードされます。`,
      confirmLabel: "すべてリセットする",
      onConfirm: doFullReset,
    });
  };

  const doDeleteBatch = async (upload) => {
    setConfirmBusy(true);
    setBatchBusyId(upload.id);
    try {
      const { data: qs, error: qErr } = await supabase.from("questions").select("id").eq("upload_id", upload.id);
      if (qErr) throw qErr;
      const ids = (qs || []).map((q) => q.id);

      let backedUpCount = 0;
      if (ids.length) {
        backedUpCount = await backupProgressForQuestionIds(ids, upload.file_name);
        const { error: delErr } = await supabase.from("questions").delete().in("id", ids);
        if (delErr) throw delErr;
      }
      await supabase.from("csv_uploads").update({ deleted_at: new Date().toISOString() }).eq("id", upload.id);

      setMsg(`「${upload.file_name || "(名称未設定)"}」の問題 ${ids.length}件を削除しました。${backedUpCount > 0 ? `紐づく学習記録${backedUpCount}件をバックアップ用CSVとして自動ダウンロードしました。` : ""}`);
      await Promise.all([loadExistingCount(), loadHistory()]);
    } catch (e) {
      setError(`削除に失敗しました: ${e.message || e}`);
    } finally {
      setBatchBusyId(null);
      setConfirmBusy(false);
      setConfirmInfo(null);
    }
  };

  const handleDeleteBatchClick = (upload) => {
    setError(null); setMsg(null);
    setConfirmInfo({
      title: "このCSVの問題を削除しますか？",
      body: `「${upload.file_name || "(名称未設定)"}」（${new Date(upload.created_at).toLocaleString("ja-JP")}にアップロード）に含まれる問題 ${upload.row_count}件を削除します。\n\nこの操作は元に戻せません。紐づく学習記録は、実行前に自動でCSVとしてダウンロードされます。他のCSVでアップロードした問題には影響しません。`,
      confirmLabel: "このCSVの問題を削除する",
      onConfirm: () => doDeleteBatch(upload),
    });
  };

  const radioStyle = { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", border: "1.5px solid var(--hairline)", borderRadius: R, cursor: "pointer", fontSize: 13, lineHeight: 1.6 };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <ConfirmModal
        info={confirmInfo}
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? null : setConfirmInfo(null))}
        onConfirm={() => confirmInfo && confirmInfo.onConfirm()}
      />
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <label style={{ ...radioStyle, background: mode === "add" ? "var(--moss-tint)" : "transparent", borderColor: mode === "add" ? "var(--moss)" : "var(--hairline)" }}>
              <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>問題を追加する</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>既存の問題はそのまま残し、今回のCSVを追加します（積み重なります）。</div>
              </div>
            </label>
            <label style={{ ...radioStyle, background: mode === "replace" ? "var(--vermilion-tint)" : "transparent", borderColor: mode === "replace" ? "var(--vermilion)" : "var(--hairline)" }}>
              <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>新規に問題を追加</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>既存の問題を全削除してから、今回のCSVだけにします。学習記録は自動でCSVバックアップされます。</div>
              </div>
            </label>
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
            <button onClick={doUpload} disabled={loading} style={{ padding: "10px 20px", background: mode === "replace" ? "var(--vermilion)" : "var(--ink)", color: "var(--surface)", border: `1.5px solid ${mode === "replace" ? "var(--vermilion)" : "var(--ink)"}`, borderRadius: R, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "処理中…" : mode === "replace" ? "既存を削除して取り込む" : "取り込む"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.8, marginTop: 16, marginBottom: 28 }}>
          <div><b>type</b>: flashcardReading（①フラッシュカード・読み方専用）／ flashcardMeaning（②フラッシュカード・意味専用）／ vocab4（③単語4択専用）／ kanji（④漢字読み方入力専用）／ grammar（⑤文法4択）／ kakitori（⑥漢字書き取り・単漢字）／ vocab4choice（⑦語彙4択）／ kanji4choice（⑧漢字4択）／ reading（⑨読解）／ reorder（⑩並べ替え）</div>
          <div><b>①②③④が別のtypeに分かれた理由</b>：以前はvocab 1種類を①②③④共通で使っていましたが、例えば漢字を含まない語彙だと①（読み方カード）や④（漢字読み方入力）が成立しないため、それぞれ専用のtypeに分けました。同じ単語を複数のモードで使いたい場合は、typeを変えて複数行に分けて入力してください（word・reading・meaning・meaning_en・exampleの列は①②③④共通です）</div>
          <div><b>vocab（従来のtype）</b>もそのまま使えます。vocabで登録した行は、これまで通り①②③④すべてに表示されます（今後は上記の専用typeを使うことをおすすめしますが、古いCSVを再アップロードしても問題ありません）</div>
          <div><b>kakitori行</b>は word 列に単漢字を1文字入れてください（例: 学）</div>
          <div><b>vocab4choice・kanji4choice行</b>はgrammarと同じくblank（問題文）・choice1〜4・answer（1〜4）を使用します。blankに___（アンダースコア3つ）を入れると空欄埋め形式に、入れなければ普通の設問文として表示されます</div>
          <div><b>___（アンダースコア3つ）</b>はgrammar・vocab4choice・kanji4choiceのblank、reorderのblankのどこでも、空欄として色付きの下線で表示されます</div>
          <div><b>ふりがな</b>：word以外の自由記述欄（example・blank・passage・q1〜q5・choice1〜4・card1〜card6など）では、「学校(がっこう)」のように漢字の直後に（半角・全角どちらでも）読み方をかっこ書きすると、学生画面では漢字の上に小さくふりがなとして表示されます</div>
          <div><b>reading行</b>はpassage（文章）と、q1〜q5（設問・choice1〜4・answer）を使用します。設問は最大5つまで、1つ以上あれば取り込めます</div>
          <div><b>reorder行</b>はblank（___を含む例文）と、card1〜card6（正しい順番の単語、3〜6枚）を使用します</div>
        </div>

        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 18, fontWeight: 800 }}>アップロード履歴</div>
            {(uploads.length > 0 || (existingCount ?? 0) > 0) && (
              <button onClick={handleFullResetClick} disabled={loading} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--vermilion)", background: "transparent", color: "var(--vermilion-deep)", borderRadius: R, cursor: loading ? "not-allowed" : "pointer", fontWeight: 600 }}>
                全リセット（問題・履歴を全削除）
              </button>
            )}
          </div>
          {historyLoading && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>読み込み中…</div>}
          {!historyLoading && uploads.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>まだアップロード履歴がありません（この機能の追加より前にアップロードされた問題は、履歴に表示されません）。</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {uploads.map((u) => {
              const busy = batchBusyId === u.id;
              return (
                <div key={u.id} style={{ background: "var(--surface)", border: "1.5px solid var(--hairline)", borderRadius: R, boxShadow: SHADOW, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, opacity: u.deleted_at ? 0.6 : 1 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{u.file_name || "(名称未設定)"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                      {u.mode === "replace" ? "新規置き換え" : "追加"}・{u.row_count}件・{new Date(u.created_at).toLocaleString("ja-JP")}
                      {u.deleted_at && <span style={{ color: "var(--vermilion-deep)" }}>（問題は削除済み）</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleDownloadHistory(u)} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--ink)", background: "transparent", borderRadius: R, cursor: "pointer" }}>ダウンロード</button>
                    {!u.deleted_at && (
                      <button onClick={() => handleDeleteBatchClick(u)} disabled={busy} style={{ fontSize: 12, padding: "6px 12px", border: "1.5px solid var(--vermilion)", background: "transparent", color: "var(--vermilion-deep)", borderRadius: R, cursor: busy ? "not-allowed" : "pointer" }}>
                        {busy ? "削除中…" : "この問題を削除"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
