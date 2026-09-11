// 教員ダッシュボードと学生「マイアカウント」画面の両方で使う集計ロジック。
// progress（③④⑤⑥の正誤記録）と study_sessions（学習時間・学習回数の記録）から
// モード×レベル別の統計を組み立てる。

export const MODE_LABELS = {
  flashcardReading: "① 読み方カード",
  flashcardMeaning: "② 意味カード",
  vocab4: "③ 単語4択",
  kanji: "④ 漢字読み",
  grammar4: "⑤ 文法4択",
  kakitori: "⑥ 書き取り",
  vocab4choice: "⑦ 語彙4択",
  kanji4choice: "⑧ 漢字4択",
  reading: "⑨ 読解",
  reorder: "⑩ 並べ替え",
};
export const QUIZ_MODES = ["vocab4", "kanji", "grammar4", "kakitori", "vocab4choice", "kanji4choice", "reading", "reorder"];
export const FLASHCARD_MODES = ["flashcardReading", "flashcardMeaning"];
export const ALL_MODES = [...FLASHCARD_MODES, ...QUIZ_MODES];
export const LEVEL_KEYS = ["N5", "N4", "N3", "N2", "N1"];

// 「学習回数」の定義：
//  ・③④⑤⑥（4択・入力・書き取りなど）は1問答えるごとに1回（やり直しも毎回カウントする）
//  ・①②（フラッシュカード）は「次へ」でカードを1枚進めるごとに1回
// 「正答率」は、同じ問題を複数回解いている場合、一番最近の解答結果だけを見る（今の理解度を表す）。
export const REVIEW_COUNT_DEFINITION =
  "「学習回数」は、③④⑤⑥では1問答えるごとに1回（やり直しも毎回カウント）、①②のフラッシュカードでは「次へ」でカードを1枚進めるごとに1回として数えています（「前へ」やシャッフルは含みません）。「正答率」は、同じ問題を複数回解いた場合、一番最近の解答結果を採用します。";

export function buildStats({ progressRows, sessionRows, questionLevelMap }) {
  const byModeLevel = {};
  ALL_MODES.forEach((m) => {
    byModeLevel[m] = {};
    LEVEL_KEYS.forEach((lv) => { byModeLevel[m][lv] = { total: 0, correct: 0, reviews: 0, seconds: 0, attempts: 0 }; });
  });

  let totalAnswered = 0, totalCorrect = 0, lastAt = null;

  // 正答率は「今の理解度」を表すため、同じ問題に複数回答えている場合は
  // 一番新しい解答（answered_atが最新のもの）だけを、その問題の正誤として採用する。
  // つまり、以前間違えた問題でも後から正解すれば正解扱いに上書きされ、
  // 逆に一度正解した問題でも後から間違えれば不正解扱いに変わる。
  // （「学習回数」の集計は、やり直しも含めた生の解答回数を別途attemptsとして数えており、
  // 　この上書きの影響を受けない＝やり直した分もきちんと学習回数としてカウントされ続ける）
  const latestByQuestion = new Map();
  (progressRows || []).forEach((p) => {
    if (!lastAt || p.answered_at > lastAt) lastAt = p.answered_at;

    const level = questionLevelMap ? questionLevelMap.get(p.question_id) : null;
    if (level && byModeLevel[p.mode] && byModeLevel[p.mode][level]) {
      byModeLevel[p.mode][level].attempts += 1;
    }

    const existing = latestByQuestion.get(p.question_id);
    if (!existing || p.answered_at > existing.answered_at) {
      latestByQuestion.set(p.question_id, p);
    }
  });

  latestByQuestion.forEach((p) => {
    const level = questionLevelMap ? questionLevelMap.get(p.question_id) : null;
    totalAnswered += 1;
    if (p.correct) totalCorrect += 1;
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

  // ③〜⑩（正誤判定のあるクイズ系モード）は、何らかの理由でstudy_sessionsの記録が欠落していても、
  // 少なくとも実際に解答した回数（attempts＝やり直しも含めた生の解答回数）ぶんは
  // 「学習回数」としてカウントされるようにする（study_sessions由来の値との、大きい方を採用）。
  // 増えた差分は全体の合計（totalReviews）にも同じだけ反映する（totalReviewsが減ることはない）。
  // ①②のフラッシュカードはprogressに記録が無いため対象外（従来通りstudy_sessionsのみを使う）。
  QUIZ_MODES.forEach((m) => {
    LEVEL_KEYS.forEach((lv) => {
      const cell = byModeLevel[m][lv];
      if (cell.attempts > cell.reviews) {
        totalReviews += cell.attempts - cell.reviews;
        cell.reviews = cell.attempts;
      }
    });
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
