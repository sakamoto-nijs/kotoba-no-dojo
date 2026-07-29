import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import NihongoApp from "../components/NihongoApp";

function mapVocab(rows) {
  return rows.map((r) => ({
    id: r.id, type: "vocab", level: r.level,
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

export default function AppPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [initialVocab, setInitialVocab] = useState([]);
  const [initialGrammar, setInitialGrammar] = useState([]);
  const [initialKakitori, setInitialKakitori] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!profile || profile.role !== "student") { router.replace("/login"); return; }

      setStudentId(session.user.id);
      setStudentName(profile.display_name);

      const { data: questions } = await supabase.from("questions").select("*");
      const rows = questions || [];
      setInitialVocab(mapVocab(rows.filter((r) => r.type === "vocab")));
      setInitialGrammar(mapGrammar(rows.filter((r) => r.type === "grammar")));
      setInitialKakitori(mapKakitori(rows.filter((r) => r.type === "kakitori")));

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
      initialVocab={initialVocab}
      initialGrammar={initialGrammar}
      initialKakitori={initialKakitori}
      studentName={studentName}
      onAnswer={handleAnswer}
      onLogout={handleLogout}
      allowLocalImport={false}
    />
  );
}
