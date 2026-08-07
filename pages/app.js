import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../lib/fetchAllRows";
import NihongoApp from "../components/NihongoApp";

function mapVocab(rows, type) {
  return rows.map((r) => ({
    id: r.id, type: type || r.type, level: r.level,
    word: r.word, reading: r.reading, meaning: r.meaning,
    meaningEn: r.meaning_en, example: r.example,
  }));
}
function mapGrammar(rows) {
  return rows.map((r) => ({
    id: r.id, type: "grammar", level: r.level,
    blank: r.blank,
    choices: [r.choice1, r.choice2, r.choice3, r.choice4],
    answer: (r.answer || 1) - 1,
  }));
}
function mapKakitori(rows) {
  return rows.map((r) => ({
    id: r.id, level: r.level, char: r.word, reading: r.reading, meaning: r.meaning,
  }));
}
// ⑦⑧ 語彙4択・漢字4択：文法穴埋め（grammar）と全く同じ形式（blank・choice1〜4・answer）を共有する
function mapBlankChoice(rows, type) {
  return rows.map((r) => ({
    id: r.id, type, level: r.level,
    blank: r.blank,
    choices: [r.choice1, r.choice2, r.choice3, r.choice4],
    answer: (r.answer || 1) - 1,
  }));
}
// ⑨ 読解：1行=1パッセージ。reading_questions（jsonb配列、最大5件）を画面用の形に変換する
function mapReading(rows) {
  return rows.map((r) => ({
    id: r.id, type: "reading", level: r.level,
    passage: r.passage,
    questions: (r.reading_questions || []).map((q) => ({
      question: q.question,
      choices: [q.choice1, q.choice2, q.choice3, q.choice4],
      answer: (q.answer || 1) - 1,
    })),
  }));
}
// ⑩ 並べ替え：cards（jsonb配列、正しい順番）をそのまま使う
function mapReorder(rows) {
  return rows.map((r) => ({
    id: r.id, type: "reorder", level: r.level,
    blank: r.blank,
    cards: r.cards || [],
  }));
}

export default function AppPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [initialFlashcardReading, setInitialFlashcardReading] = useState([]);
  const [initialFlashcardMeaning, setInitialFlashcardMeaning] = useState([]);
  const [initialVocab4, setInitialVocab4] = useState([]);
  const [initialKanji, setInitialKanji] = useState([]);
  const [initialGrammar, setInitialGrammar] = useState([]);
  const [initialKakitori, setInitialKakitori] = useState([]);
  const [initialVocab4Choice, setInitialVocab4Choice] = useState([]);
  const [initialKanji4Choice, setInitialKanji4Choice] = useState([]);
  const [initialReading, setInitialReading] = useState([]);
  const [initialReorder, setInitialReorder] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!profile || profile.role !== "student") { router.replace("/login"); return; }

      setStudentId(session.user.id);
      setStudentName(profile.display_name);

      const rows = await fetchAllRows(() => supabase.from("questions").select("*"));
      // 従来の type='vocab' は後方互換のため①②③④すべてに含める（新しい専用typeと併用可能）
      setInitialFlashcardReading(mapVocab(rows.filter((r) => r.type === "vocab" || r.type === "flashcardReading"), "flashcardReading"));
      setInitialFlashcardMeaning(mapVocab(rows.filter((r) => r.type === "vocab" || r.type === "flashcardMeaning"), "flashcardMeaning"));
      setInitialVocab4(mapVocab(rows.filter((r) => r.type === "vocab" || r.type === "vocab4"), "vocab4"));
      setInitialKanji(mapVocab(rows.filter((r) => r.type === "vocab" || r.type === "kanji"), "kanji"));
      setInitialGrammar(mapGrammar(rows.filter((r) => r.type === "grammar")));
      setInitialKakitori(mapKakitori(rows.filter((r) => r.type === "kakitori")));
      setInitialVocab4Choice(mapBlankChoice(rows.filter((r) => r.type === "vocab4choice"), "vocab4choice"));
      setInitialKanji4Choice(mapBlankChoice(rows.filter((r) => r.type === "kanji4choice"), "kanji4choice"));
      setInitialReading(mapReading(rows.filter((r) => r.type === "reading")));
      setInitialReorder(mapReorder(rows.filter((r) => r.type === "reorder")));

      setReady(true);
    })();
  }, [router]);

  const handleAnswer = async (questionId, mode, correct) => {
    if (!studentId || !questionId) return;
    // questionIdがSupabase由来のUUIDでない場合（サンプルデータ使用時など）は記録しない
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(questionId));
    if (!looksLikeUuid) return;
    await supabase.from("progress").insert({
      student_id: studentId,
      question_id: questionId,
      mode,
      correct,
    });
  };

  const handleSessionEnd = async ({ mode, level, durationSeconds, items }) => {
    if (!studentId || !level) return;
    await supabase.from("study_sessions").insert({
      student_id: studentId,
      mode,
      level,
      items,
      duration_seconds: durationSeconds,
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--ink-soft)", fontFamily: "'Klee One', sans-serif" }}>
        読み込み中…
      </div>
    );
  }

  return (
    <NihongoApp
      initialFlashcardReading={initialFlashcardReading}
      initialFlashcardMeaning={initialFlashcardMeaning}
      initialVocab4={initialVocab4}
      initialKanji={initialKanji}
      initialGrammar={initialGrammar}
      initialKakitori={initialKakitori}
      initialVocab4Choice={initialVocab4Choice}
      initialKanji4Choice={initialKanji4Choice}
      initialReading={initialReading}
      initialReorder={initialReorder}
      studentName={studentName}
      onAnswer={handleAnswer}
      onSessionEnd={handleSessionEnd}
      onLogout={handleLogout}
      myPageHref="/mypage"
      allowLocalImport={false}
    />
  );
}
