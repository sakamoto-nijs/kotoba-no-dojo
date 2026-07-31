// 教員ダッシュボードと学生「マイアカウント」画面の両方で使う集計ロジック。
// progress（③④⑤⑥の正誤記録）と study_sessions（学習時間・学習回数の記録）から
// モード×レベル別の統計を組み立てる。

export const MODE_LABELS = {
  flashcardReading: "① 読み方カード",
  flashcardMeaning: "② 意味カード",
  vocab4: "③ 単語4択",
  kanji: "④ 漢字読み",
  grammar4: "⑤ 文法穴埋め",
  kakitori: "⑥ 書き取り",
};
export const QUIZ_MODES = ["vocab4", "kanji", "grammar4", "kakitori"];
export const FLASHCARD_MODES = ["flashcardReading", "flashcardMeaning"];
export const ALL_MODES = [...FLASHCARD_MODES, ...QUIZ_MODES];
export const LEVEL_KEYS = ["N5", "N4", "N3", "N2", "N1"];

// 「学習回数」の定義：
//  ・③④⑤⑥（4択・入力・書き取りなど）は1問答えるごとに1回
//  ・①②（フラッシュカード）は「次へ」でカードを1枚進めるごとに1回
export const REVIEW_COUNT_DEFINITION =
  "「学習回数」は、③④⑤⑥では1問答えるごとに1回、①②のフラッシュカードでは「次へ」でカードを1枚進めるごとに1回として数えています（「前へ」やシャッフルは含みません）。";

export function buildStats({ progressRows, sessionRows, questionLevelMap }) {
  const byModeLevel = {};
  ALL_MODES.forEach((m) => {
    byModeLevel[m] = {};
    LEVEL_KEYS.forEach((lv) => { byModeLevel[m][lv] = { total: 0, correct: 0, reviews: 0, seconds: 0 }; });
  });

  let totalAnswered = 0, totalCorrect = 0, lastAt = null;

  (progressRows || []).forEach((p) => {
    const level = questionLevelMap ? questionLevelMap.get(p.question_id) : null;
    totalAnswered += 1;
    if (p.correct) totalCorrect += 1;
    if (!lastAt || p.answered_at > lastAt) lastAt = p.answered_at;
    if (level && byModeLevel[p.mode] && byModeLevel[p.mode][level]) {
      byModeLevel[p.mode][level].total += 1;
      if (p.correct) byModeLevel[p.mode][level].correct += 1;
    }
  });

  let totalStudySeconds = 0;
  let totalReviews = 0;
  (sessionRows || []).forEach((s) => {
    totalStudySeconds += s.duration_seconds || 0;
    totalReviews += s.items || 0;
    if (!lastAt || s.started_at > lastAt) lastAt = s.started_at;
    if (byModeLevel[s.mode] && byModeLevel[s.mode][s.level]) {
      byModeLevel[s.mode][s.level].reviews += s.items || 0;
      byModeLevel[s.mode][s.level].seconds += s.duration_seconds || 0;
    }
  });

  return { totalAnswered, totalCorrect, totalStudySeconds, totalReviews, lastAt, byModeLevel };
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  if (seconds === 0) return "0分";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  if (seconds < 60) return `${seconds}秒`;
  return `${m}分`;
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
