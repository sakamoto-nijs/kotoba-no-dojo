// 正解・不正解の効果音（先生からいただいた音声ファイルを再生する）。
// ファイルは public/sounds/ に置き、/sounds/... のパスでブラウザから読み込む。
const CORRECT_SOUND_URL = "/sounds/correct.mp3";
const INCORRECT_SOUND_URL = "/sounds/incorrect.mp3";

// ページを開いた時点で読み込みを始めておく（1問目から遅延なく鳴らすため）。
// サーバー側（ビルド時など）ではwindow/Audioが存在しないため、ブラウザ上でのみ生成する。
let correctAudio = typeof window !== "undefined" ? new Audio(CORRECT_SOUND_URL) : null;
let incorrectAudio = typeof window !== "undefined" ? new Audio(INCORRECT_SOUND_URL) : null;
if (correctAudio) correctAudio.preload = "auto";
if (incorrectAudio) incorrectAudio.preload = "auto";

function play(audio) {
  if (!audio) return;
  try {
    audio.currentTime = 0; // 短い間隔で連続して答えた場合も、毎回最初から鳴らす
    audio.play().catch(() => {});
  } catch {
    // 効果音の再生に失敗しても、学習自体には影響させない
  }
}

export function playCorrectSound() {
  play(correctAudio);
}

export function playIncorrectSound() {
  play(incorrectAudio);
}
