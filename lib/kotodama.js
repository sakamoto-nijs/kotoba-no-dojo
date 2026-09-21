// ことだま育成機能：レベル／XP計算とキャラクターSVG生成をまとめたモジュール。
// キャラクターの見た目（20段階・炎の耳と尻尾・腰の帯・額の印・目の変化・金のオーラ）は
// 別チャットで作成されたプロトタイプ（kotodama-companion.html）のロジックをそのまま移植したもの。
// pages/kotodama.js（本人用ページ）と components/NihongoApp.jsx（ホーム画面のミニ表示）の両方から使う。

// ---------- カテゴリ分類 ----------
// 漢字＝①④⑥⑧／語彙＝②③⑦／文法＝⑤⑨⑩
// mode文字列はlib/statsHelpers.jsのMODE_LABELSのキーと同じもの（DB上のprogress.mode / study_sessions.mode）。
export const CATEGORY_BY_MODE = {
  flashcardReading: "kanji",
  kanji: "kanji",
  kakitori: "kanji",
  kanji4choice: "kanji",
  flashcardMeaning: "vocab",
  vocab4: "vocab",
  vocab4choice: "vocab",
  grammar4: "grammar",
  reading: "grammar",
  reorder: "grammar",
};
export const CATEGORY_LABELS = { kanji: "漢字", vocab: "語彙", grammar: "文法" };
export const FLASHCARD_MODES = ["flashcardReading", "flashcardMeaning"];

// ---------- XP計算（正誤あり問題：③④⑤⑥⑦⑧⑨⑩） ----------
// 基礎点：正解10／不正解4。時間ボーナス：10秒ごとに+1、上限90秒（+9）。
// 1秒未満のスパムクリック対策は行わない（確定仕様）。
export function timeBonus(seconds) {
  if (!seconds || seconds <= 0) return 0;
  return Math.min(9, Math.floor(Math.min(seconds, 90) / 10));
}
export function quizAnswerXP({ correct, elapsedSeconds }) {
  return (correct ? 10 : 4) + timeBonus(elapsedSeconds);
}

// ---------- XP計算（正誤なし：①②フラッシュカード） ----------
// フラッシュカードは1枚ごとのDB書き込みを行わないため（通信回数を増やさないための設計）、
// study_sessionsに既にある「枚数（items）」と「区間の合計秒数（duration_seconds）」から計算する。
//   1枚につき基礎点2 ＋ 区間の時間ボーナス（10秒ごとに+1）
// 時間ボーナスは「開いたまま放置」対策として、枚数×90秒を超える分は切り捨てる
// （1問90秒上限の考え方を、区間全体に一般化したもの）。
export function flashcardSessionXP({ items, durationSeconds }) {
  const safeItems = items || 0;
  const safeDuration = durationSeconds || 0;
  const cappedDuration = Math.min(safeDuration, safeItems * 90);
  return safeItems * 2 + Math.floor(cappedDuration / 10);
}

// ---------- レベルカーブ（確定仕様） ----------
// requiredXP(L) = round(12 × L^1.35)　／　Lv1〜100
export function xpForLevel(level) {
  return Math.round(12 * Math.pow(level, 1.35));
}
export function computeLevel(totalXP) {
  let level = 1;
  let remaining = totalXP || 0;
  let need = xpForLevel(level);
  while (level < 100 && remaining >= need) {
    remaining -= need;
    level += 1;
    need = xpForLevel(level);
  }
  if (level >= 100) {
    level = 100;
    need = xpForLevel(100);
    if (remaining > need) remaining = need;
  }
  return { level, remaining, need };
}
export function stageOfLevel(level) {
  return Math.max(1, Math.min(20, Math.ceil(level / 5)));
}

// ---------- 学習データからの集計 ----------
// progressRows: { mode, correct, elapsed_seconds }[]（③〜⑩のみが対象。①②の行は存在しない想定）
// sessionRows:  { mode, items, duration_seconds }[]（①〜⑩すべての区間記録。カテゴリXPには①②分だけ使う）
export function computeKotodamaStats({ progressRows, sessionRows }) {
  const categories = { kanji: 0, vocab: 0, grammar: 0 };

  (progressRows || []).forEach((p) => {
    const category = CATEGORY_BY_MODE[p.mode];
    if (!category) return;
    categories[category] += quizAnswerXP({ correct: p.correct, elapsedSeconds: p.elapsed_seconds });
  });

  (sessionRows || []).forEach((s) => {
    if (!FLASHCARD_MODES.includes(s.mode)) return; // ③〜⑩の区間はprogress側で計算済みなのでここでは使わない
    const category = CATEGORY_BY_MODE[s.mode];
    if (!category) return;
    categories[category] += flashcardSessionXP({ items: s.items, durationSeconds: s.duration_seconds });
  });

  const totalXP = categories.kanji + categories.vocab + categories.grammar;
  const { level, remaining, need } = computeLevel(totalXP);
  return { categories, totalXP, level, xpIntoLevel: remaining, xpNeeded: need, stage: stageOfLevel(level) };
}

// ---------- キャラクター（20段階） ----------
export const STAGE_COLORS = [
  "#F2ECDC", "#EEE0B3", "#EAD489", "#E5C860",
  "#E3C24A", "#B8B34F", "#8DA354", "#639459",
  "#4C8C5C", "#45806A", "#3F7477", "#386785",
  "#35618C", "#304E6C", "#2B3C4C", "#27292C",
  "#241F1B", "#241F1B", "#241F1B", "#241F1B",
];
export const STAGE_LABELS = [
  "白帯（幼子期）", "白帯（幼子期）", "白帯（幼子期）", "白帯（幼子期）",
  "黄帯（少年期）", "黄帯（少年期）", "黄帯（少年期）", "黄帯（少年期）",
  "緑帯（若者期）", "緑帯（若者期）", "緑帯（若者期）", "緑帯（若者期）",
  "青帯（壮年期）", "青帯（壮年期）", "青帯（壮年期）", "青帯（壮年期）",
  "黒帯 初段（達人期）", "黒帯 弐段（達人期）", "黒帯 参段（達人期）", "黒帯 皆伝（達人期）",
];
const GOLD = "#C9A24D", INK = "#241F1B", CREAM = "#F7F2E4";

function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
function rgbToHex(a) { return "#" + a.map((c) => { c = Math.max(0, Math.min(255, Math.round(c))); return c.toString(16).padStart(2, "0").toUpperCase(); }).join(""); }
function darken(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex([r * (1 - amt), g * (1 - amt), b * (1 - amt)]); }
function lighten(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]); }

function eraOf(stage) { return Math.ceil(stage / 4); }
function subOf(stage) { return (stage - 1) % 4; }
function overallT(stage) { return (stage - 1) / 19; }

function flame(length, width, bend) {
  return `M ${-width},0 C ${-width - bend},${-length * 0.45} ${-width * 0.4},${-length * 0.85} 0,${-length} ` +
    `C ${width * 0.4},${-length * 0.85} ${width + bend},${-length * 0.45} ${width},0 Z`;
}

const EAR_CFG = {
  1: { outer: [13, 6, 2], anchor: [24, 24], rot: 14, inner: null, tipDot: false },
  2: { outer: [18, 7, 4], anchor: [27, 26], rot: 19, inner: null, tipDot: false },
  3: { outer: [23, 7, 7], anchor: [29, 28], rot: 25, inner: null, tipDot: false },
  4: { outer: [28, 8, 10], anchor: [31, 29], rot: 29, inner: [17, 5, 4, 25, 22, 15], tipDot: false },
  5: { outer: [32, 9, 12], anchor: [33, 30], rot: 33, inner: [19, 6, 5, 26, 23, 17], tipDot: true },
};
const TAIL_CFG = {
  1: { d: "M 25,36 C 39,42 45,52 37,58", w: 5, tip: null },
  2: { d: "M 25,36 C 45,44 53,38 53,24 C 57,40 47,58 29,60", w: 6, tip: [10, 4, 2, 29, 60, 168] },
  3: { d: "M 25,36 C 49,42 61,30 57,12 C 65,30 57,56 27,64", w: 6.5, tip: [13, 5, 3, 27, 64, 163] },
  4: { d: "M 25,36 C 51,42 69,26 59,2 C 73,18 71,50 39,62 C 27,66 21,58 29,54", w: 7, tip: [17, 6, 4, 29, 54, 158] },
  5: { d: "M 25,36 C 53,42 73,24 61,-4 C 77,14 75,48 41,62 C 25,68 17,58 27,52", w: 7.5, tip: [21, 7, 5, 27, 52, 153] },
};

// stage(1〜20)を受け取り、キャラクターのSVG文字列を返す。
// React側では <div dangerouslySetInnerHTML={{ __html: buildCreatureSVG(stage) }} /> のように使う。
export function buildCreatureSVG(stage) {
  stage = Math.max(1, Math.min(20, stage));
  const era = eraOf(stage), sub = subOf(stage), tEra = sub / 3, tAll = overallT(stage);
  const color = STAGE_COLORS[stage - 1];
  const baseColor = darken(color, 0.14);
  const scale = 0.55 + tAll * 0.65;
  const eyeOpen = 1.0 - tAll * 0.5;
  const isLightBody = era <= 1;
  let parts = [];

  parts.push(`<circle cx="0" cy="4" r="66" fill="${INK}" opacity="0.05"/>`);

  if (era >= 4) {
    const auraOp = era === 4 ? (0.14 + tEra * 0.12) : (0.30 + tEra * 0.16);
    const auraR = 70 + tAll * 20;
    parts.push(`<circle cx="0" cy="0" r="${auraR.toFixed(1)}" fill="${GOLD}" opacity="${auraOp.toFixed(2)}" filter="url(#kdBlur)"/>`);
  }

  const tc = TAIL_CFG[era];
  parts.push(`<path d="${tc.d}" stroke="${color}" stroke-width="${tc.w}" fill="none" stroke-linecap="round"/>`);
  if (tc.tip) {
    const [tlen, twid, tbend, tx, ty, trot] = tc.tip;
    const tipColor = era === 5 ? GOLD : color;
    parts.push(`<g transform="translate(${tx},${ty}) rotate(${trot})"><path d="${flame(tlen, twid, tbend)}" fill="${tipColor}"/></g>`);
  }
  if (era === 5) {
    parts.push(`<circle cx="44" cy="68" r="2.2" fill="${GOLD}" opacity="0.85"/>`);
    parts.push(`<circle cx="52" cy="60" r="1.6" fill="${GOLD}" opacity="0.7"/>`);
  }

  const ec = EAR_CFG[era];
  const [olen, owid, obend] = ec.outer;
  const [ax, ay] = ec.anchor;
  for (const side of [-1, 1]) {
    parts.push(`<g transform="translate(${side * ax},${-ay}) rotate(${side * ec.rot})"><path d="${flame(olen, owid, obend)}" fill="${color}"/></g>`);
    if (ec.inner) {
      const [ilen, iwid, ibend, iax, iay, irot] = ec.inner;
      const innerColor = era < 5 ? darken(color, 0.18) : GOLD;
      parts.push(`<g transform="translate(${side * iax},${-iay}) rotate(${side * irot})"><path d="${flame(ilen, iwid, ibend)}" fill="${innerColor}" opacity="0.9"/></g>`);
    }
    if (ec.tipDot) {
      const rad = (side * ec.rot * Math.PI) / 180;
      const tipx = side * ax + -olen * Math.sin(-rad);
      const tipy = -ay + -olen * Math.cos(-rad);
      parts.push(`<circle cx="${tipx.toFixed(1)}" cy="${tipy.toFixed(1)}" r="3" fill="${GOLD}"/>`);
    }
  }

  const strokeAttr = isLightBody
    ? `stroke="${INK}" stroke-opacity="0.32" stroke-width="2"`
    : `stroke="${INK}" stroke-opacity="0.12" stroke-width="1.5"`;
  parts.push(`<ellipse cx="0" cy="46" rx="${(27 * scale).toFixed(1)}" ry="${(16 * scale).toFixed(1)}" fill="${baseColor}" ${strokeAttr}/>`);
  parts.push(`<ellipse cx="0" cy="0" rx="${(42 * scale).toFixed(1)}" ry="${(38 * scale).toFixed(1)}" fill="${color}" ${strokeAttr}/>`);

  const sashColor = era === 5 ? GOLD : INK;
  const sashOp = era === 5 ? 0.85 : 0.55 + tAll * 0.25;
  const bodyBottom = 38 * scale;
  const y1 = bodyBottom - (10 + tAll * 3);
  const y2 = y1 + 7 + tAll * 7;
  const w = 33 * scale;
  parts.push(`<path d="M ${-w},${y1.toFixed(1)} Q 0,${(y1 + 9).toFixed(1)} ${w},${y1.toFixed(1)} L ${w},${y2.toFixed(1)} Q 0,${(y2 + 9).toFixed(1)} ${-w},${y2.toFixed(1)} Z" fill="${sashColor}" opacity="${sashOp.toFixed(2)}"/>`);
  if (era >= 3) parts.push(`<circle cx="0" cy="${((y1 + y2) / 2).toFixed(1)}" r="4" fill="${lighten(sashColor, 0.5)}"/>`);

  const fy = -30 * scale;
  if (era === 2) {
    parts.push(`<circle cx="0" cy="${fy.toFixed(1)}" r="2.4" fill="${GOLD}" opacity="0.8"/>`);
  } else if (era === 3) {
    parts.push(`<path d="M -5,${fy.toFixed(1)} L 5,${fy.toFixed(1)} M 0,${(fy - 5).toFixed(1)} L 0,${(fy + 5).toFixed(1)}" stroke="${GOLD}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`);
  } else if (era >= 4) {
    parts.push(`<g opacity="0.9"><circle cx="0" cy="${fy.toFixed(1)}" r="3" fill="${GOLD}"/>` +
      `<path d="M 0,${(fy - 8).toFixed(1)} L 0,${(fy - 3).toFixed(1)} M 0,${(fy + 3).toFixed(1)} L 0,${(fy + 8).toFixed(1)} M -8,${fy.toFixed(1)} L -3,${fy.toFixed(1)} M 3,${fy.toFixed(1)} L 8,${fy.toFixed(1)}" ` +
      `stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/></g>`);
  }

  const eyeRy = (3.2 * eyeOpen + 1.6).toFixed(1);
  const faceColor = era <= 3 ? INK : CREAM;
  parts.push(`<ellipse cx="-13" cy="-4" rx="4.6" ry="${eyeRy}" fill="${faceColor}"/>`);
  parts.push(`<ellipse cx="13" cy="-4" rx="4.6" ry="${eyeRy}" fill="${faceColor}"/>`);
  if (era <= 3) {
    parts.push(`<circle cx="-13" cy="-3.4" r="2" fill="${INK}"/>`);
    parts.push(`<circle cx="13" cy="-3.4" r="2" fill="${INK}"/>`);
  }
  const mouthCurve = tAll < 0.5 ? 4 : 2.4;
  parts.push(`<path d="M -6,${(8 + mouthCurve * 0.3).toFixed(1)} Q 0,${(8 + mouthCurve).toFixed(1)} 6,${(8 + mouthCurve * 0.3).toFixed(1)}" stroke="${faceColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`);

  return `<svg width="190" height="210" viewBox="-90 -110 180 220" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><filter id="kdBlur"><feGaussianBlur stdDeviation="7"/></filter></defs>` +
    parts.join("") + `</svg>`;
}
