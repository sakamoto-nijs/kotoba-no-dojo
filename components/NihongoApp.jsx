import React, { useState, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import * as tf from "@tensorflow/tfjs";
import {
  BookOpen, ListChecks, Type, PenLine, Upload, Shuffle,
  RotateCcw, Check, X, ChevronRight, ChevronLeft, Download,
  ArrowLeft, RefreshCw, FileText, Star, Repeat, Languages, PenTool, UserCircle,
  BookOpenCheck, Hash, BookOpenText, GripVertical, Home,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Klee+One:wght@400;600&display=swap');`;

// PCで100%表示だと余白が多く感じるため、タブレット以上の画面幅では125%相当の大きさで表示する
// （スマホ表示はこのままのサイズが最適なので対象外）。読解画面（reading）はもともと分量が多く
// スクロール前提のため、他の画面（ホーム・レベル選択・読解以外の問題画面）はスクロール無しに収まる想定。
const DESKTOP_SCALE_CSS = `
@media (min-width: 768px) {
  .kotoba-dojo-root { zoom: 1.25; }
}
`;

const COLORS = {
  bg: "#F2ECDA",
  surface: "#FBF7EC",
  ink: "#241F1A",
  inkSoft: "#5C564C",
  inkFaint: "#9C927E",
  indigo: "#2B4570",
  indigoDeep: "#1C2E4A",
  vermilion: "#B7410E",
  vermilionDeep: "#8F2A25",
  vermilionTint: "#F5E7DD",
  moss: "#3F6B4F",
  mossTint: "#E9EFE9",
  hairline: "#D9CFB4",
  star: "#F4C430",
};
const R = 3;
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
// 書き取り用の手書きキャンバスのポインター。ブラウザ標準の cursor:"crosshair" は
// 環境によって白っぽく表示され見えにくいことがあるため、黒い十字を自前のSVGで指定する。
const BLACK_CROSSHAIR_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><line x1="11" y1="1" x2="11" y2="21" stroke="black" stroke-width="1.6"/><line x1="1" y1="11" x2="21" y2="11" stroke="black" stroke-width="1.6"/></svg>') 11 11, crosshair`;
const SERIF = "'Shippori Mincho', serif";  // トップ画面（ホーム）専用
const SANS = "'Zen Kaku Gothic New', sans-serif"; // トップ画面（ホーム）専用
const KLEE = "'Klee One', sans-serif"; // 学習画面全般（留学生にも読みやすい書体）

const LEVELS = [
  { key: "N5", desc: "初級" },
  { key: "N4", desc: "初中級" },
  { key: "N3", desc: "中級" },
  { key: "N2", desc: "中上級" },
  { key: "N1", desc: "上級" },
];
const LEVEL_KEYS = LEVELS.map((l) => l.key);

const MODE_TITLES = {
  flashcardReading: "① フラッシュカード（読み方）",
  flashcardMeaning: "② フラッシュカード（意味）",
  vocab4: "③ 単語4択問題",
  kanji: "④ 漢字読み方入力",
  grammar4: "⑤ 文法穴埋め",
  kakitori: "⑥ 漢字書き取り",
  vocab4choice: "⑦ 語彙4択問題",
  kanji4choice: "⑧ 漢字4択問題",
  reading: "⑨ 読解問題",
  reorder: "⑩ 並べ替え問題",
};

const SAMPLE_VOCAB = [
  { type: "vocab", level: "N5", word: "学校", reading: "がっこう", meaning: "学ぶための場所", meaningEn: "school", example: "毎日学校に行きます。" },
  { type: "vocab", level: "N5", word: "先生", reading: "せんせい", meaning: "教える人", meaningEn: "teacher", example: "先生はやさしいです。" },
  { type: "vocab", level: "N5", word: "電話", reading: "でんわ", meaning: "話すための機械", meaningEn: "telephone", example: "友達に電話をかけます。" },
  { type: "vocab", level: "N5", word: "家族", reading: "かぞく", meaning: "親・兄弟など", meaningEn: "family", example: "私の家族は四人です。" },
  { type: "vocab", level: "N4", word: "勉強", reading: "べんきょう", meaning: "学ぶこと", meaningEn: "studying", example: "毎日日本語を勉強します。" },
  { type: "vocab", level: "N4", word: "図書館", reading: "としょかん", meaning: "本を借りたり読んだりする場所", meaningEn: "library", example: "週末は図書館で勉強します。" },
  { type: "vocab", level: "N4", word: "天気", reading: "てんき", meaning: "空の様子・晴れや雨など", meaningEn: "weather", example: "今日は天気がいいです。" },
  { type: "vocab", level: "N4", word: "病院", reading: "びょういん", meaning: "病気やけがを治す場所", meaningEn: "hospital", example: "頭が痛いので病院に行きます。" },
  { type: "vocab", level: "N3", word: "約束", reading: "やくそく", meaning: "前もって決めておくこと", meaningEn: "promise", example: "友達と会う約束をしました。" },
  { type: "vocab", level: "N3", word: "経験", reading: "けいけん", meaning: "実際にやって得た知識や技術", meaningEn: "experience", example: "いい経験になりました。" },
  { type: "vocab", level: "N3", word: "準備", reading: "じゅんび", meaning: "前もって用意すること", meaningEn: "preparation", example: "旅行の準備をしています。" },
  { type: "vocab", level: "N3", word: "説明", reading: "せつめい", meaning: "わかりやすく話すこと", meaningEn: "explanation", example: "先生が問題の説明をします。" },
  { type: "vocab", level: "N2", word: "相談", reading: "そうだん", meaning: "意見を聞いたり話し合ったりすること", meaningEn: "consultation", example: "進路について先生に相談しました。" },
  { type: "vocab", level: "N2", word: "参加", reading: "さんか", meaning: "集まりや行事に加わること", meaningEn: "participation", example: "文化祭に参加します。" },
  { type: "vocab", level: "N2", word: "影響", reading: "えいきょう", meaning: "他のものに及ぼす働き", meaningEn: "influence", example: "天気が体調に影響します。" },
  { type: "vocab", level: "N2", word: "成長", reading: "せいちょう", meaning: "育って大きくなること", meaningEn: "growth", example: "子供が大きく成長しました。" },
  { type: "vocab", level: "N1", word: "概念", reading: "がいねん", meaning: "物事のおおまかな意味内容", meaningEn: "concept", example: "新しい概念を学びました。" },
  { type: "vocab", level: "N1", word: "矛盾", reading: "むじゅん", meaning: "つじつまが合わないこと", meaningEn: "contradiction", example: "彼の話には矛盾がある。" },
  { type: "vocab", level: "N1", word: "妥協", reading: "だきょう", meaning: "譲り合って合意すること", meaningEn: "compromise", example: "双方が妥協点を探った。" },
  { type: "vocab", level: "N1", word: "把握", reading: "はあく", meaning: "物事をよく理解すること", meaningEn: "grasp / understanding", example: "状況を正確に把握する。" },
];

const SAMPLE_GRAMMAR = [
  { type: "grammar", level: "N5", blank: "昨日友達___会いました。", choices: ["に", "を", "が", "で"], answer: 0 },
  { type: "grammar", level: "N5", blank: "明日は雨___降るかもしれません。", choices: ["が", "を", "は", "で"], answer: 0 },
  { type: "grammar", level: "N4", blank: "この本は難しくて___わかりません。", choices: ["あまり", "とても", "少し", "たくさん"], answer: 0 },
  { type: "grammar", level: "N4", blank: "雨が降っている___、傘を持っていきます。", choices: ["ので", "のに", "けど", "し"], answer: 0 },
  { type: "grammar", level: "N3", blank: "食べ___、すぐに歯を磨きます。", choices: ["てから", "ながら", "ても", "そう"], answer: 0 },
  { type: "grammar", level: "N3", blank: "電車が遅れた___、会議に間に合いませんでした。", choices: ["ため", "のに", "けど", "し"], answer: 0 },
  { type: "grammar", level: "N2", blank: "彼は忙しい___、いつも手伝ってくれる。", choices: ["のに", "ので", "から", "けど"], answer: 0 },
  { type: "grammar", level: "N2", blank: "説明を聞いた___、まだよく分からない。", choices: ["ものの", "のに", "けど", "ため"], answer: 0 },
  { type: "grammar", level: "N1", blank: "事故が起きた___、直ちに対応した。", choices: ["とたん", "ものの", "きり", "あげく"], answer: 0 },
  { type: "grammar", level: "N1", blank: "彼の才能は誰も及ぶ___ない。", choices: ["ところでは", "ことなど", "はずも", "べくも"], answer: 3 },
];

const KAKITORI_DATA = [
  { type: "kakitori", level: "N5", char: "学", reading: "がく / まな.ぶ", meaning: "学ぶこと・学問" },
  { type: "kakitori", level: "N5", char: "校", reading: "こう", meaning: "まなびや・学校" },
  { type: "kakitori", level: "N5", char: "先", reading: "せん / さき", meaning: "順序が前であること" },
  { type: "kakitori", level: "N5", char: "生", reading: "せい / い.きる", meaning: "生きる・生まれる" },
  { type: "kakitori", level: "N4", char: "電", reading: "でん", meaning: "電気" },
  { type: "kakitori", level: "N4", char: "話", reading: "わ / はな.す", meaning: "話すこと" },
  { type: "kakitori", level: "N4", char: "強", reading: "きょう / つよ.い", meaning: "強いこと" },
  { type: "kakitori", level: "N4", char: "弱", reading: "じゃく / よわ.い", meaning: "弱いこと" },
  { type: "kakitori", level: "N3", char: "約", reading: "やく", meaning: "取り決めること・おおよそ" },
  { type: "kakitori", level: "N3", char: "験", reading: "けん", meaning: "試すこと・ためし" },
  { type: "kakitori", level: "N3", char: "準", reading: "じゅん", meaning: "基準・なぞらえる" },
  { type: "kakitori", level: "N3", char: "備", reading: "び / そな.える", meaning: "用意すること" },
  { type: "kakitori", level: "N2", char: "境", reading: "きょう / さかい", meaning: "境目・区切り" },
  { type: "kakitori", level: "N2", char: "響", reading: "きょう / ひび.く", meaning: "音が伝わり広がること" },
  { type: "kakitori", level: "N1", char: "概", reading: "がい", meaning: "おおむね・あらまし" },
  { type: "kakitori", level: "N1", char: "矛", reading: "む / ほこ", meaning: "武器の一種。つじつまが合わない意にも使う" },
];

const SAMPLE_VOCAB4CHOICE = [
  { type: "vocab4choice", level: "N5", blank: "「食べる」の意味として正しいものを選びなさい。", choices: ["食事をする", "外に出る", "本を読む", "友達と話す"], answer: 0 },
  { type: "vocab4choice", level: "N4", blank: "「準備する」の意味として正しいものを選びなさい。", choices: ["前もって用意する", "急いで走る", "静かに聞く", "強く押す"], answer: 0 },
  { type: "vocab4choice", level: "N3", blank: "「経験」の意味として正しいものを選びなさい。", choices: ["実際にやって得た知識", "机の上の道具", "決まりごと", "毎日の天気"], answer: 0 },
  { type: "vocab4choice", level: "N2", blank: "「影響」の意味として正しいものを選びなさい。", choices: ["他のものに及ぼす働き", "遠くへ行くこと", "静かに待つこと", "新しく作ること"], answer: 0 },
  { type: "vocab4choice", level: "N1", blank: "「妥協」の意味として正しいものを選びなさい。", choices: ["譲り合って合意すること", "強く主張し続けること", "全く無関係なこと", "細かく分析すること"], answer: 0 },
];

const SAMPLE_KANJI4CHOICE = [
  { type: "kanji4choice", level: "N5", blank: "「学校」の読み方として正しいものを選びなさい。", choices: ["がっこう", "がくこう", "かっこう", "がっごう"], answer: 0 },
  { type: "kanji4choice", level: "N4", blank: "「病院」の読み方として正しいものを選びなさい。", choices: ["びょういん", "びよういん", "びょうえん", "ひょういん"], answer: 0 },
  { type: "kanji4choice", level: "N3", blank: "「準備」の読み方として正しいものを選びなさい。", choices: ["じゅんび", "じゅんひ", "しゅんび", "じゅび"], answer: 0 },
  { type: "kanji4choice", level: "N2", blank: "「相談」の読み方として正しいものを選びなさい。", choices: ["そうだん", "そうたん", "しょうだん", "そだん"], answer: 0 },
  { type: "kanji4choice", level: "N1", blank: "「把握」の読み方として正しいものを選びなさい。", choices: ["はあく", "はにぎ", "はわ", "はおく"], answer: 0 },
];

const SAMPLE_READING = [
  {
    type: "reading", level: "N5", passage: "私は毎朝七時に起きます。朝ご飯を食べてから、学校に行きます。学校では友達と日本語を勉強します。放課後は図書館で本を読みます。",
    questions: [
      { question: "「私」は何時に起きますか。", choices: ["七時", "六時", "八時", "九時"], answer: 0 },
      { question: "放課後、どこへ行きますか。", choices: ["図書館", "病院", "駅", "家"], answer: 0 },
    ],
  },
  {
    type: "reading", level: "N3", passage: "先週、友達と旅行の計画を立てました。天気予報によると、来週末は雨が降るそうです。そのため、予定を少し変更することにしました。",
    questions: [
      { question: "来週末の天気はどうですか。", choices: ["雨が降る", "晴れる", "雪が降る", "わからない"], answer: 0 },
      { question: "なぜ予定を変更しましたか。", choices: ["天気予報のため", "友達がいないため", "お金がないため", "学校があるため"], answer: 0 },
    ],
  },
];

const SAMPLE_REORDER = [
  { type: "reorder", level: "N5", blank: "私は___。", cards: ["教室で", "日本語", "を", "勉強する"] },
  { type: "reorder", level: "N4", blank: "彼は___。", cards: ["毎日", "図書館", "で", "本を", "読みます"] },
  { type: "reorder", level: "N3", blank: "この問題は___。", cards: ["説明", "を", "聞いても", "よくわからない"] },
  { type: "reorder", level: "N2", blank: "彼の意見に___。", cards: ["賛成", "する", "人", "も", "いる"] },
  { type: "reorder", level: "N1", blank: "彼の才能は___。", cards: ["誰も", "及ぶ", "べくも", "ない"] },
];


const CSV_TEMPLATE = `type,level,word,reading,meaning,meaning_en,example,blank,choice1,choice2,choice3,choice4,answer
vocab,N4,食事,しょくじ,食べること,meal,家族と食事をします。,,,,,,
grammar,N3,,,,,,この駅___乗り換えます。,で,に,を,が,1
`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 文字数に応じてフラッシュカード等の主要テキストのフォントサイズを自動調整
function autoFontSize(text, max = 64, min = 22, threshold = 3, shrinkPerChar = 4) {
  const len = (text || "").length;
  if (len <= threshold) return max;
  const size = max - (len - threshold) * shrinkPerChar;
  return Math.max(min, size);
}

/* ================= 漢字書き取り：手書き認識 =================
   DaKanji Single Kanji Recognition（CaptainDario, MIT License。
   ETL文字データベース＋KanjiVGで学習）を使用。
   モデル本体は参考サイト（筆順 -hitsujun-）で公開されているものを
   そのまま読み込んでいます（数十MBのバイナリのためアプリ内には同梱できず、
   外部URLからfetchする方式にしています）。 */
const DAKANJI_MODEL_BASE = "https://sakamoto-nijs.github.io/kanji-tool/model";
let dakanjiModel = null;
let dakanjiLoading = null;
let DAKANJI_LABELS = null;

async function loadDaKanjiModel(onStatus) {
  if (dakanjiModel) return dakanjiModel;
  if (dakanjiLoading) return dakanjiLoading;
  dakanjiLoading = (async () => {
    onStatus && onStatus("認識モデルを読み込み中…（初回のみ数十MB通信します）");
    const [model, labels] = await Promise.all([
      tf.loadGraphModel(`${DAKANJI_MODEL_BASE}/model.json`),
      fetch(`${DAKANJI_MODEL_BASE}/labels.json`).then((r) => r.json()),
    ]);
    dakanjiModel = model;
    DAKANJI_LABELS = labels;
    onStatus && onStatus("準備できました。書いて「認識する」を押してください。");
    return model;
  })();
  return dakanjiLoading;
}

function renderStrokesToInferenceCanvas(strokes, size) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  if (strokes.length === 0) return c;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((s) => s.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }));
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const margin = size * 0.14;
  const scale = Math.min((size - margin * 2) / w, (size - margin * 2) / h);
  const offX = (size - w * scale) / 2 - minX * scale;
  const offY = (size - h * scale) / 2 - minY * scale;

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  strokes.forEach((s) => {
    if (s.length < 2) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x * scale + offX, s[0].y * scale + offY, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s[0].x * scale + offX, s[0].y * scale + offY);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * scale + offX, s[i].y * scale + offY);
    ctx.stroke();
  });
  return c;
}

async function recognizeWithModel(strokes) {
  const model = await loadDaKanjiModel();
  const canvas = renderStrokesToInferenceCanvas(strokes, 96);
  const input = tf.tidy(() => {
    let img = tf.browser.fromPixels(canvas, 1);
    img = img.toFloat();
    return img.expandDims(0);
  });
  let output;
  try { output = model.execute(input); }
  catch (e) { output = await model.executeAsync(input); }
  const data = await output.data();
  input.dispose(); output.dispose();
  const scored = Array.from(data).map((p, i) => ({ idx: i, prob: p }));
  scored.sort((a, b) => b.prob - a.prob);
  return scored.slice(0, 8).map((s) => ({ char: DAKANJI_LABELS[s.idx], prob: s.prob }));
}

// 手書きキャンバスのポインタ操作をまとめたフック（ストロークはRefで保持し再描画を避ける）
function useCanvasPad() {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: cx, y: cy };
    };
    const start = (e) => { e.preventDefault(); const p = pos(e); currentRef.current = [p]; ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!currentRef.current) return; e.preventDefault(); const p = pos(e); currentRef.current.push(p); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { if (!currentRef.current) return; strokesRef.current.push(currentRef.current); currentRef.current = null; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentRef.current = null;
  };

  return { canvasRef, strokesRef, clear };
}


function parseCSVText(text) {
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const vocab = [];
  const grammar = [];
  const problems = [];

  result.data.forEach((row, idx) => {
    const type = (row.type || "").trim();
    let level = (row.level || "").trim().toUpperCase();
    if (!LEVEL_KEYS.includes(level)) {
      if (level) problems.push(`${idx + 2}行目: levelは N5〜N1 にしてください（"${level}"）→ N5として扱いました`);
      level = "N5";
    }

    if (type === "vocab") {
      if (!row.word || !row.reading) {
        problems.push(`${idx + 2}行目: word か reading が空です`);
        return;
      }
      vocab.push({
        type: "vocab",
        level,
        word: row.word.trim(),
        reading: row.reading.trim(),
        meaning: (row.meaning || "").trim(),
        meaningEn: (row.meaning_en || "").trim(),
        example: (row.example || "").trim(),
      });
    } else if (type === "grammar") {
      const choices = [row.choice1, row.choice2, row.choice3, row.choice4].map((c) => (c || "").trim());
      const answerNum = parseInt(row.answer, 10);
      if (!row.blank || choices.some((c) => !c) || !answerNum || answerNum < 1 || answerNum > 4) {
        problems.push(`${idx + 2}行目: 文法問題のデータが不完全です`);
        return;
      }
      grammar.push({
        type: "grammar",
        level,
        blank: row.blank.trim(),
        choices,
        answer: answerNum - 1,
      });
    } else if (type) {
      problems.push(`${idx + 2}行目: typeは vocab か grammar にしてください（"${type}"）`);
    }
  });

  return { vocab, grammar, problems };
}

function StarButton({ active, onClick, style }) {
  return (
    <button
      onClick={onClick}
      aria-label="お気に入り"
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, lineHeight: 0, ...style }}
    >
      <Star size={22} color={active ? COLORS.star : COLORS.inkFaint} fill={active ? COLORS.star : "none"} strokeWidth={1.8} />
    </button>
  );
}

function TopBar({ title, onExit, progress }) {
  return (
    <div className="flex items-center justify-between mb-6" style={{ borderBottom: `2px solid ${COLORS.ink}`, paddingBottom: 12 }}>
      <button onClick={onExit} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkSoft, background: "transparent", border: "none", fontFamily: KLEE, cursor: "pointer" }}>
        <ArrowLeft size={16} /> 戻る
      </button>
      <div style={{ fontFamily: KLEE, fontWeight: 600, fontSize: 17, color: COLORS.ink, textAlign: "center" }}>{title}</div>
      <div style={{ fontSize: 12, color: COLORS.inkFaint, minWidth: 60, textAlign: "right", fontFamily: KLEE }}>{progress || ""}</div>
    </div>
  );
}

function ResultCard({ score, total, onRestart, onExit }) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  return (
    <div className="p-10" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, boxShadow: SHADOW, borderRadius: R }}>
      <div style={{ fontFamily: KLEE, fontSize: 12, color: COLORS.vermilion, letterSpacing: "0.14em", marginBottom: 10, fontWeight: 600 }}>結果</div>
      <div style={{ fontFamily: KLEE, fontSize: 44, fontWeight: 600, color: COLORS.ink, marginBottom: 4 }}>{score} / {total}</div>
      <div style={{ color: COLORS.inkSoft, marginBottom: 26, fontFamily: KLEE, fontSize: 13 }}>正答率 {pct}%</div>
      <div className="flex items-center justify-center gap-3">
        <button onClick={onRestart} className="flex items-center gap-1 px-5 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, fontFamily: KLEE, fontSize: 13, fontWeight: 600, borderRadius: R, cursor: "pointer" }}>
          <RefreshCw size={15} /> もう一度
        </button>
        <button onClick={onExit} className="px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, fontFamily: KLEE, fontSize: 13, fontWeight: 600, borderRadius: R, cursor: "pointer" }}>
          レベル選択へ戻る
        </button>
      </div>
    </div>
  );
}

function LevelSelect({ modeKey, fullList, favSet, idOf, minRequired, onSelect, onExit }) {
  const countFor = (levelKey) => fullList.filter((item) => item.level === levelKey).length;
  const favCount = fullList.filter((item) => favSet.has(idOf(item))).length;

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={MODE_TITLES[modeKey]} onExit={onExit} />
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18, fontFamily: KLEE, textAlign: "center" }}>
        練習したいJLPTレベルを選んでください
      </div>
      <div className="flex flex-col gap-3">
        <button
          disabled={favCount < minRequired}
          onClick={() => onSelect("FAV")}
          className="flex items-center justify-between px-6 py-4"
          style={{
            background: COLORS.surface, border: `1.5px solid ${COLORS.star}`, borderRadius: R, boxShadow: SHADOW,
            opacity: favCount < minRequired ? 0.4 : 1, cursor: favCount < minRequired ? "not-allowed" : "pointer",
          }}
        >
          <div className="flex items-center gap-4">
            <Star size={24} color={COLORS.star} fill={COLORS.star} strokeWidth={1.5} />
            <div style={{ fontFamily: KLEE, fontSize: 15, fontWeight: 600, color: COLORS.ink }}>お気に入り</div>
          </div>
          <div style={{ fontFamily: KLEE, fontSize: 12, color: COLORS.inkFaint }}>{favCount}問{favCount < minRequired ? "（不足）" : ""}</div>
        </button>

        {LEVELS.map((lv) => {
          const count = countFor(lv.key);
          const disabled = count < minRequired;
          return (
            <button
              key={lv.key}
              disabled={disabled}
              onClick={() => onSelect(lv.key)}
              className="flex items-center justify-between px-6 py-4"
              style={{
                background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW,
                opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              <div className="flex items-center gap-4">
                <div style={{ fontFamily: KLEE, fontSize: 24, fontWeight: 600, color: COLORS.vermilion, minWidth: 52, textAlign: "left" }}>{lv.key}</div>
                <div style={{ fontFamily: KLEE, fontSize: 13, color: COLORS.inkSoft }}>{lv.desc}</div>
              </div>
              <div style={{ fontFamily: KLEE, fontSize: 12, color: COLORS.inkFaint }}>{count}問{disabled ? "（準備中）" : ""}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlashcardMode({ vocab, level, lang, cardMode, favVocab, onToggleFav, onCardAdvance, onExit }) {
  const [order, setOrder] = useState(() => vocab.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reversed, setReversed] = useState(false);
  const current = vocab[order[pos]];
  const title = `${cardMode === "reading" ? MODE_TITLES.flashcardReading : MODE_TITLES.flashcardMeaning}（${level}）`;
  const isFav = favVocab.has(current.word);
  const meaningText = lang === "en" ? (current.meaningEn || current.meaning) : current.meaning;

  // 「次へ」でカードを1枚進めるたびに1回とカウントする（学習回数の定義）
  const next = () => { setFlipped(false); setPos((p) => (p + 1) % order.length); if (onCardAdvance) onCardAdvance(); };
  const prev = () => { setFlipped(false); setPos((p) => (p - 1 + order.length) % order.length); };
  const doShuffle = () => { setOrder(shuffle(vocab.map((_, i) => i))); setPos(0); setFlipped(false); };

  // 「単語側」と「情報側」、それぞれの表示内容は固定。表裏入れ替えはどちらを先に見せるかだけを変える。
  // 読み方カードは「単語＋読み方」のみ、意味カードは「単語＋意味」のみを表示し、互いの情報は混在させない。
  const wordSide = (
    <div style={{ fontFamily: KLEE, fontWeight: 600, fontSize: autoFontSize(current.word), color: COLORS.ink }}>{current.word}</div>
  );
  const infoSide = cardMode === "reading" ? (
    <div style={{ fontFamily: KLEE, fontSize: autoFontSize(current.reading, 40, 20, 4), color: COLORS.indigo, fontWeight: 600 }}>{current.reading}</div>
  ) : (
    <div style={{ fontSize: autoFontSize(meaningText, 34, 18, 8), color: COLORS.ink, fontFamily: KLEE }}>{meaningText}</div>
  );
  const frontContent = reversed ? infoSide : wordSide;
  const backContent = reversed ? wordSide : infoSide;
  const showing = flipped ? backContent : frontContent;

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${pos + 1} / ${order.length}`} />
      <div
        onClick={() => setFlipped((f) => !f)}
        className="cursor-pointer flex flex-col items-center justify-center text-center select-none relative"
        style={{
          background: `linear-gradient(${COLORS.hairline} 1px, transparent 1px) 0 0/100% 33.3%, linear-gradient(90deg, ${COLORS.hairline} 1px, transparent 1px) 0 0/33.3% 100%`,
          backgroundColor: COLORS.surface,
          border: `1.5px solid ${COLORS.ink}`,
          minHeight: 260,
          borderRadius: R,
          boxShadow: SHADOW,
          padding: 24,
        }}
      >
        <StarButton active={isFav} onClick={(e) => { e.stopPropagation(); onToggleFav(current.word); }} style={{ position: "absolute", top: 8, right: 8 }} />
        {showing}
      </div>
      <div className="flex items-center justify-between mt-6 flex-wrap gap-2">
        <button onClick={prev} className="flex items-center gap-1 px-4 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <ChevronLeft size={17} /> 前へ
        </button>
        <button onClick={() => { setReversed((r) => !r); setFlipped(false); }} className="flex items-center gap-1 px-4 py-2" style={{ border: `1.5px solid ${COLORS.indigo}`, background: reversed ? COLORS.indigo : "transparent", color: reversed ? COLORS.surface : COLORS.indigo, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Repeat size={16} /> 表裏を入れ替え
        </button>
        <button onClick={doShuffle} className="flex items-center gap-1 px-4 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={16} /> シャッフル
        </button>
        <button onClick={next} className="flex items-center gap-1 px-4 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          次へ <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}

function Vocab4Mode({ vocab, level, lang, favVocab, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.vocab4}（${level}）`;
  const buildQuestions = () =>
    shuffle(vocab).map((v) => {
      const distractors = shuffle(vocab.filter((x) => x.word !== v.word)).slice(0, 3).map((x) => x.word);
      const options = shuffle([v.word, ...distractors]);
      const meaningText = lang === "en" ? (v.meaningEn || v.meaning) : v.meaning;
      return { id: v.id || v.word, q: meaningText, answer: v.word, options };
    });

  const [questions, setQuestions] = useState(buildQuestions);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favVocab.has(current.answer) : false;

  const choose = (opt) => {
    if (selected) return;
    setSelected(opt);
    const correct = opt === current.answer;
    if (correct) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id, "vocab4", correct);
  };
  const next = () => { setSelected(null); setIdx((i) => i + 1); };
  const restart = () => { setIdx(0); setSelected(null); setScore(0); };
  const doShuffle = () => { setQuestions(buildQuestions()); setIdx(0); setSelected(null); setScore(0); };

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={restart} onExit={onExit} />
      </div>
    );

  }

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>
      <div className="p-8 mb-6 relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.answer)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 11, color: COLORS.vermilion, marginBottom: 10, letterSpacing: "0.1em", fontWeight: 600, fontFamily: KLEE }}>この意味を表す単語は？</div>
        <div style={{ fontSize: autoFontSize(current.q, 21, 14, 20), color: COLORS.ink, fontWeight: 500, fontFamily: KLEE }}>{current.q}</div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {current.options.map((opt, i) => {
          let style = { background: COLORS.surface, border: `1.5px solid ${COLORS.hairline}`, color: COLORS.ink };
          if (selected) {
            if (opt === current.answer) style = { background: COLORS.mossTint, border: `1.5px solid ${COLORS.moss}`, color: COLORS.moss };
            else if (opt === selected) style = { background: COLORS.vermilionTint, border: `1.5px solid ${COLORS.vermilion}`, color: COLORS.vermilionDeep };
          }
          return (
            <button key={i} onClick={() => choose(opt)} className="flex items-center justify-between px-5 py-4 text-left" style={{ ...style, fontFamily: KLEE, fontSize: 20, fontWeight: 600, borderRadius: R, cursor: selected ? "default" : "pointer" }}>
              {opt}
              {selected && opt === current.answer && <Check size={20} />}
              {selected && opt === selected && opt !== current.answer && <X size={20} />}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="flex justify-end mt-6">
          <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            次の問題 <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function KanjiInputMode({ vocab, level, favVocab, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.kanji}（${level}）`;
  const [questions, setQuestions] = useState(() => shuffle(vocab));
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favVocab.has(current.word) : false;
  const inputRef = useRef(null);

  const check = () => {
    if (checked) return;
    const ok = input.trim() === current.reading.trim();
    setCorrect(ok);
    setChecked(true);
    if (ok) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || current.word, "kanji", ok);
  };
  const next = () => {
    setInput("");
    setChecked(false);
    setIdx((i) => i + 1);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };
  const restart = () => { setIdx(0); setInput(""); setChecked(false); setScore(0); };
  const doShuffle = () => { setQuestions(shuffle(vocab)); setIdx(0); setInput(""); setChecked(false); setScore(0); };

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={restart} onExit={onExit} />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>
      <div
        className="mb-6 text-center flex flex-col items-center justify-center relative"
        style={{
          background: `linear-gradient(${COLORS.hairline} 1px, transparent 1px) 0 0/100% 33.3%, linear-gradient(90deg, ${COLORS.hairline} 1px, transparent 1px) 0 0/33.3% 100%`,
          backgroundColor: COLORS.surface,
          border: `1.5px solid ${COLORS.ink}`,
          borderRadius: R,
          boxShadow: SHADOW,
          minHeight: 220,
          padding: 24,
        }}
      >
        <StarButton active={isFav} onClick={() => onToggleFav(current.word)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 14, letterSpacing: "0.08em", fontFamily: KLEE }}>読み方をひらがなで入力してください</div>
        <div style={{ fontFamily: KLEE, fontWeight: 600, fontSize: autoFontSize(current.word), color: COLORS.ink }}>{current.word}</div>
      </div>
      <div className="flex gap-3">
        <input
          ref={inputRef}
          value={input}
          disabled={checked}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { checked ? next() : check(); } }}
          placeholder="ひらがなで入力"
          className="flex-1 px-4 py-3"
          style={{ border: `1.5px solid ${COLORS.ink}`, fontSize: 18, fontFamily: KLEE, borderRadius: R, background: COLORS.surface, color: COLORS.ink, outline: "none" }}
        />
        {!checked ? (
          <button onClick={check} className="px-5 py-3" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>答える</button>
        ) : (
          <button onClick={next} className="px-5 py-3 flex items-center gap-1" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            次へ <ChevronRight size={17} />
          </button>
        )}
      </div>
      {checked && (
        <div className="mt-4 px-5 py-4" style={{ background: correct ? COLORS.mossTint : COLORS.vermilionTint, color: correct ? COLORS.moss : COLORS.vermilionDeep, border: `1.5px solid ${correct ? COLORS.moss : COLORS.vermilion}`, borderRadius: R, fontFamily: KLEE, fontSize: 14 }}>
          {correct ? "正解です！" : `不正解です。正しい読み方: ${current.reading}`}
        </div>
      )}
    </div>
  );
}

function GrammarMode({ grammar, level, favGrammar, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.grammar4}（${level}）`;
  const [questions, setQuestions] = useState(() => shuffle(grammar));
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favGrammar.has(current.blank) : false;

  const choose = (i) => {
    if (selected !== null) return;
    setSelected(i);
    const correct = i === current.answer;
    if (correct) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || current.blank, "grammar4", correct);
  };
  const next = () => { setSelected(null); setIdx((i) => i + 1); };
  const restart = () => { setIdx(0); setSelected(null); setScore(0); };
  const doShuffle = () => { setQuestions(shuffle(grammar)); setIdx(0); setSelected(null); setScore(0); };

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={restart} onExit={onExit} />
      </div>
    );
  }

  const parts = current.blank.split("___");

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>
      <div className="p-8 mb-6 text-center relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.blank)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 20, lineHeight: 1.9, color: COLORS.ink, fontFamily: KLEE }}>
          {parts[0]}
          <span style={{ display: "inline-block", minWidth: 48, borderBottom: `2px solid ${COLORS.vermilion}`, margin: "0 4px", color: COLORS.indigo, fontWeight: 600, fontFamily: KLEE }}>
            {selected !== null ? current.choices[selected] : "　　"}
          </span>
          {parts[1]}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {current.choices.map((c, i) => {
          let style = { background: COLORS.surface, border: `1.5px solid ${COLORS.hairline}`, color: COLORS.ink };
          if (selected !== null) {
            if (i === current.answer) style = { background: COLORS.mossTint, border: `1.5px solid ${COLORS.moss}`, color: COLORS.moss };
            else if (i === selected) style = { background: COLORS.vermilionTint, border: `1.5px solid ${COLORS.vermilion}`, color: COLORS.vermilionDeep };
          }
          return (
            <button key={i} onClick={() => choose(i)} className="px-5 py-4" style={{ ...style, fontFamily: KLEE, fontSize: 18, fontWeight: 600, borderRadius: R, cursor: selected !== null ? "default" : "pointer" }}>
              {c}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="flex justify-end mt-6">
          <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            次の問題 <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function KakitoriMode({ list, level, favSet, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.kakitori}（${level}）`;
  const [questions, setQuestions] = useState(() => shuffle(list));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [picked, setPicked] = useState(null);
  const [status, setStatus] = useState("モデルを読み込み中です…");
  const [recognizing, setRecognizing] = useState(false);
  const { canvasRef, strokesRef, clear } = useCanvasPad();
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favSet.has(current.char) : false;

  useEffect(() => {
    loadDaKanjiModel(setStatus).catch(() => setStatus("モデルの読み込みに失敗しました（通信環境をご確認ください）。"));
  }, []);

  useEffect(() => {
    clear();
    setCandidates([]);
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={() => { setIdx(0); setScore(0); }} onExit={onExit} />
      </div>
    );
  }

  const doRecognize = async () => {
    if (strokesRef.current.length === 0) { setStatus("まず枠の中に書いてください。"); return; }
    setRecognizing(true);
    setStatus("認識しています…");
    try {
      const results = await recognizeWithModel(strokesRef.current);
      setCandidates(results);
      setStatus("候補の中から、自分が書いた漢字を選んでください（左ほど自信度が高い）");
    } catch (e) {
      setStatus("認識中にエラーが発生しました。通信環境をご確認ください。");
    } finally {
      setRecognizing(false);
    }
  };

  const choose = (char) => {
    if (picked) return;
    setPicked(char);
    const correct = char === current.char;
    if (correct) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || current.char, "kakitori", correct);
  };
  const skip = () => {
    if (picked) return;
    setPicked("__SKIP__");
    if (onAnswer) onAnswer(current.id || current.char, "kakitori", false);
  };
  const next = () => setIdx((i) => i + 1);
  const doShuffle = () => { setQuestions(shuffle(list)); setIdx(0); setScore(0); };

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>

      <div className="p-6 mb-4 text-center relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.char)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 10, letterSpacing: "0.08em", fontFamily: KLEE }}>次の意味・読み方を持つ漢字を書いてください</div>
        <div style={{ fontFamily: KLEE, fontSize: 24, color: COLORS.indigo, fontWeight: 600 }}>{current.reading}</div>
        <div style={{ fontSize: 15, color: COLORS.ink, fontFamily: KLEE, marginTop: 6 }}>{current.meaning}</div>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: "100%", height: 260, display: "block",
          background: `linear-gradient(${COLORS.hairline} 1px, transparent 1px) 0 0/100% 33.3%, linear-gradient(90deg, ${COLORS.hairline} 1px, transparent 1px) 0 0/33.3% 100%, ${COLORS.surface}`,
          border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW, touchAction: "none", cursor: BLACK_CROSSHAIR_CURSOR,
        }}
      />
      <div className="flex gap-3 mt-3">
        <button onClick={() => { clear(); setCandidates([]); setStatus(""); }} className="px-4 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          消す
        </button>
        <button
          onClick={doRecognize}
          disabled={recognizing || !!picked}
          className="flex-1"
          style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: recognizing || picked ? "not-allowed" : "pointer", opacity: recognizing || picked ? 0.5 : 1 }}
        >
          認識する
        </button>
      </div>
      <div className="flex justify-end mt-2">
        <button onClick={skip} disabled={!!picked} className="flex items-center gap-1 text-sm px-3 py-1.5" style={{ border: "none", background: "transparent", color: COLORS.inkSoft, textDecoration: "underline", fontFamily: KLEE, cursor: picked ? "not-allowed" : "pointer", opacity: picked ? 0.5 : 1 }}>
          わからない（スキップ）
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 10, fontFamily: KLEE, minHeight: 18 }}>{status}</div>

      {candidates.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-4">
          {candidates.map((c, i) => {
            let style = { background: COLORS.surface, border: `1.5px solid ${COLORS.hairline}`, color: COLORS.ink };
            if (picked) {
              if (c.char === current.char) style = { background: COLORS.mossTint, border: `1.5px solid ${COLORS.moss}`, color: COLORS.moss };
              else if (c.char === picked) style = { background: COLORS.vermilionTint, border: `1.5px solid ${COLORS.vermilion}`, color: COLORS.vermilionDeep };
            }
            return (
              <button key={i} onClick={() => choose(c.char)} className="flex flex-col items-center justify-center py-3" style={{ ...style, borderRadius: R, aspectRatio: "1", fontFamily: KLEE, cursor: picked ? "default" : "pointer" }}>
                <div style={{ fontSize: 26 }}>{c.char}</div>
                <div style={{ fontSize: 10, color: COLORS.inkFaint }}>{(c.prob * 100).toFixed(0)}%</div>
              </button>
            );
          })}
        </div>
      )}

      {picked && (
        <div className="mt-4 px-5 py-4" style={
          picked === current.char
            ? { background: COLORS.mossTint, color: COLORS.moss, border: `1.5px solid ${COLORS.moss}`, borderRadius: R, fontFamily: KLEE, fontSize: 14 }
            : picked === "__SKIP__"
              ? { background: COLORS.surface, color: COLORS.inkSoft, border: `1.5px solid ${COLORS.hairline}`, borderRadius: R, fontFamily: KLEE, fontSize: 14 }
              : { background: COLORS.vermilionTint, color: COLORS.vermilionDeep, border: `1.5px solid ${COLORS.vermilion}`, borderRadius: R, fontFamily: KLEE, fontSize: 14 }
        }>
          {picked === current.char ? "正解です！" : picked === "__SKIP__" ? `スキップしました。正しい漢字：${current.char}` : `不正解です。正しい漢字: ${current.char}`}
        </div>
      )}

      {picked && (
        <div className="flex justify-end mt-6">
          <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            次の問題 <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

// ⑦⑧ 語彙4択・漢字4択（教員がCSVで問題文・選択肢4つ・正解番号を直接入力する。形式は⑤文法穴埋めと同じ）
function BlankChoiceQuizMode({ modeKey, list, level, favSet, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES[modeKey]}（${level}）`;
  const [questions, setQuestions] = useState(() => shuffle(list));
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favSet.has(current.id || current.blank) : false;

  const choose = (i) => {
    if (selected !== null) return;
    setSelected(i);
    const correct = i === current.answer;
    if (correct) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || current.blank, modeKey, correct);
  };
  const next = () => { setSelected(null); setIdx((i) => i + 1); };
  const restart = () => { setIdx(0); setSelected(null); setScore(0); };
  const doShuffle = () => { setQuestions(shuffle(list)); setIdx(0); setSelected(null); setScore(0); };

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={restart} onExit={onExit} />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>
      <div className="p-8 mb-6 text-center relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.id || current.blank)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 17, lineHeight: 1.9, color: COLORS.ink, fontFamily: KLEE }}>{current.blank}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {current.choices.map((c, i) => {
          let style = { background: COLORS.surface, border: `1.5px solid ${COLORS.hairline}`, color: COLORS.ink };
          if (selected !== null) {
            if (i === current.answer) style = { background: COLORS.mossTint, border: `1.5px solid ${COLORS.moss}`, color: COLORS.moss };
            else if (i === selected) style = { background: COLORS.vermilionTint, border: `1.5px solid ${COLORS.vermilion}`, color: COLORS.vermilionDeep };
          }
          return (
            <button key={i} onClick={() => choose(i)} className="px-5 py-4" style={{ ...style, fontFamily: KLEE, fontSize: 16, fontWeight: 600, borderRadius: R, cursor: selected !== null ? "default" : "pointer" }}>
              {c}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="flex justify-end mt-6">
          <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            次の問題 <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

// ⑨ 読解問題（1つの文章につき、最大5つの設問・選択肢を同じ画面にまとめて表示する）
function ReadingMode({ list, level, favSet, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.reading}（${level}）`;
  const [passages, setPassages] = useState(() => shuffle(list));
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState({});
  const [score, setScore] = useState(0);
  const totalQuestions = list.reduce((sum, p) => sum + (p.questions ? p.questions.length : 0), 0);
  const finished = idx >= passages.length;
  const current = !finished ? passages[idx] : null;
  const isFav = current ? favSet.has(current.id || current.passage) : false;

  useEffect(() => {
    setAnswered({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={totalQuestions} onRestart={() => { setIdx(0); setScore(0); setPassages(shuffle(list)); }} onExit={onExit} />
      </div>
    );
  }

  const chooseSub = (subIdx, choiceIdx) => {
    if (answered[subIdx] !== undefined) return;
    setAnswered((prev) => ({ ...prev, [subIdx]: choiceIdx }));
    const q = current.questions[subIdx];
    const correct = choiceIdx === q.answer;
    if (correct) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || `${idx}`, "reading", correct);
  };
  const allAnswered = current.questions.every((_, i) => answered[i] !== undefined);
  const next = () => setIdx((i) => i + 1);
  const doShuffle = () => { setPassages(shuffle(list)); setIdx(0); setAnswered({}); setScore(0); };

  return (
    <div className="max-w-2xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${passages.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>

      <div className="p-6 mb-4 relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.id || current.passage)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 15, lineHeight: 2, color: COLORS.ink, fontFamily: KLEE, whiteSpace: "pre-wrap", paddingRight: 28 }}>{current.passage}</div>
      </div>

      {current.questions.map((q, qi) => {
        const sel = answered[qi];
        return (
          <div key={qi} className="p-5 mb-4" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, fontFamily: KLEE, color: COLORS.ink }}>問{qi + 1}. {q.question}</div>
            <div className="grid grid-cols-1 gap-2">
              {q.choices.map((c, ci) => {
                let style = { background: COLORS.bg, border: `1.5px solid ${COLORS.hairline}`, color: COLORS.ink };
                if (sel !== undefined) {
                  if (ci === q.answer) style = { background: COLORS.mossTint, border: `1.5px solid ${COLORS.moss}`, color: COLORS.moss };
                  else if (ci === sel) style = { background: COLORS.vermilionTint, border: `1.5px solid ${COLORS.vermilion}`, color: COLORS.vermilionDeep };
                }
                return (
                  <button key={ci} onClick={() => chooseSub(qi, ci)} className="px-4 py-3 text-left" style={{ ...style, borderRadius: R, fontFamily: KLEE, fontSize: 14, cursor: sel !== undefined ? "default" : "pointer" }}>
                    {ci + 1}. {c}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {allAnswered && (
        <div className="flex justify-end mt-2 mb-6">
          <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            次のパッセージ <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

// ⑩ 並べ替え問題（カードをタップ、またはドラッグ＆ドロップで正しい順番に並べる）
function ReorderMode({ list, level, favSet, onToggleFav, onAnswer, onExit }) {
  const title = `${MODE_TITLES.reorder}（${level}）`;
  const [questions, setQuestions] = useState(() => shuffle(list));
  const [idx, setIdx] = useState(0);
  const [pool, setPool] = useState([]);
  const [slots, setSlots] = useState([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const finished = idx >= questions.length;
  const current = !finished ? questions[idx] : null;
  const isFav = current ? favSet.has(current.id || current.blank) : false;

  useEffect(() => {
    if (finished) return;
    const q = questions[idx];
    setPool(shuffle(q.cards.map((w, i) => ({ key: `${idx}-${i}-${w}`, word: w }))));
    setSlots(new Array(q.cards.length).fill(null));
    setChecked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <TopBar title={title} onExit={onExit} />
        <ResultCard score={score} total={questions.length} onRestart={() => { setIdx(0); setScore(0); setQuestions(shuffle(list)); }} onExit={onExit} />
      </div>
    );
  }

  const placeCard = (card) => {
    if (checked) return;
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return;
    setSlots((prev) => { const next = [...prev]; next[emptyIdx] = card; return next; });
    setPool((prev) => prev.filter((c) => c.key !== card.key));
  };
  const removeSlot = (slotIdx) => {
    if (checked || !slots[slotIdx]) return;
    const card = slots[slotIdx];
    setSlots((prev) => { const next = [...prev]; next[slotIdx] = null; return next; });
    setPool((prev) => [...prev, card]);
  };
  const onDragStartCard = (e, card) => { e.dataTransfer.setData("text/plain", card.key); };
  const onDropSlot = (e, slotIdx) => {
    e.preventDefault();
    if (checked || slots[slotIdx] !== null) return;
    const key = e.dataTransfer.getData("text/plain");
    const card = pool.find((c) => c.key === key);
    if (!card) return;
    setPool((prev) => prev.filter((c) => c.key !== key));
    setSlots((prev) => { const next = [...prev]; next[slotIdx] = card; return next; });
  };

  const allFilled = slots.every((s) => s !== null);
  const isAllCorrect = allFilled && slots.every((s, i) => s.word === current.cards[i]);
  const check = () => {
    if (!allFilled || checked) return;
    setChecked(true);
    if (isAllCorrect) setScore((s) => s + 1);
    if (onAnswer) onAnswer(current.id || current.blank, "reorder", isAllCorrect);
  };
  const next = () => setIdx((i) => i + 1);
  const doShuffle = () => { setQuestions(shuffle(list)); setIdx(0); setScore(0); };

  const parts = current.blank && current.blank.includes("___") ? current.blank.split("___") : [current.blank || "", ""];

  return (
    <div className="max-w-xl mx-auto">
      <TopBar title={title} onExit={onExit} progress={`${idx + 1} / ${questions.length}`} />
      <div className="flex justify-end mb-2">
        <button onClick={doShuffle} className="flex items-center gap-1 px-3 py-1.5" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Shuffle size={14} /> シャッフル
        </button>
      </div>

      <div className="p-6 mb-4 text-center relative" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <StarButton active={isFav} onClick={() => onToggleFav(current.id || current.blank)} style={{ position: "absolute", top: 8, right: 8 }} />
        <div style={{ fontSize: 18, lineHeight: 1.9, color: COLORS.ink, fontFamily: KLEE }}>
          {parts[0]}<span style={{ color: COLORS.inkFaint }}>＿＿＿</span>{parts[1]}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: COLORS.inkFaint, marginBottom: 8, fontFamily: KLEE, textAlign: "center" }}>
        正しい順番になるように、下のカードをタップ（またはドラッグ）して並べてください
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3" style={{ minHeight: 56, border: `1.5px dashed ${COLORS.inkFaint}`, borderRadius: R, background: COLORS.bg }}>
        {slots.map((s, i) => {
          let borderColor = s ? COLORS.ink : COLORS.hairline;
          let color = COLORS.ink;
          if (checked && s) { borderColor = s.word === current.cards[i] ? COLORS.moss : COLORS.vermilion; color = s.word === current.cards[i] ? COLORS.moss : COLORS.vermilionDeep; }
          return (
            <div
              key={i}
              onClick={() => removeSlot(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropSlot(e, i)}
              draggable={!!s && !checked}
              onDragStart={(e) => s && onDragStartCard(e, s)}
              style={{
                minWidth: 56, minHeight: 40, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center",
                background: s ? COLORS.surface : "transparent", border: `1.5px solid ${borderColor}`, color,
                borderRadius: R, fontFamily: KLEE, fontSize: 15, fontWeight: 600, cursor: s && !checked ? "pointer" : "default",
              }}
            >
              {s ? s.word : ""}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {pool.map((c) => (
          <button
            key={c.key}
            draggable={!checked}
            onDragStart={(e) => onDragStartCard(e, c)}
            onClick={() => placeCard(c)}
            disabled={checked}
            className="px-4 py-2"
            style={{ border: `1.5px solid ${COLORS.ink}`, background: COLORS.surface, color: COLORS.ink, borderRadius: R, fontFamily: KLEE, fontSize: 15, fontWeight: 600, cursor: checked ? "not-allowed" : "pointer" }}
          >
            {c.word}
          </button>
        ))}
      </div>

      {!checked ? (
        <div className="flex justify-end">
          <button onClick={check} disabled={!allFilled} className="px-5 py-3" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: allFilled ? "pointer" : "not-allowed", opacity: allFilled ? 1 : 0.5 }}>
            答える
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 px-5 py-4" style={{
            background: isAllCorrect ? COLORS.mossTint : COLORS.vermilionTint,
            color: isAllCorrect ? COLORS.moss : COLORS.vermilionDeep,
            border: `1.5px solid ${isAllCorrect ? COLORS.moss : COLORS.vermilion}`,
            borderRadius: R, fontFamily: KLEE, fontSize: 14,
          }}>
            {isAllCorrect ? "正解です！" : `不正解です。正しい順番：${current.cards.join(" / ")}`}
          </div>
          <div className="flex justify-end mt-6">
            <button onClick={next} className="flex items-center gap-1 px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              次の問題 <ChevronRight size={17} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ImportPanel({ onImport, onExit }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file, "UTF-8");
  };

  const doImport = () => {
    if (!text.trim()) { setError("CSVデータが空です。"); return; }
    const { vocab, grammar, problems } = parseCSVText(text);
    if (vocab.length === 0 && grammar.length === 0) {
      setError("有効なデータが見つかりませんでした。列名や形式を確認してください。");
      return;
    }
    setError(null);
    onImport({ vocab, grammar, problems });
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nihongo_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <TopBar title="CSVインポート" onExit={onExit} />
      <div className="p-6 mb-4" style={{ background: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, boxShadow: SHADOW }}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div style={{ fontSize: 13, color: COLORS.inkSoft, fontFamily: KLEE }}>ExcelからCSV形式で保存したファイルを選択するか、内容を貼り付けてください</div>
          <button onClick={downloadTemplate} className="flex items-center gap-1 text-sm px-3 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.ink, whiteSpace: "nowrap", borderRadius: R, fontFamily: KLEE, fontWeight: 600, cursor: "pointer" }}>
            <Download size={14} /> テンプレート
          </button>
        </div>
        <label className="flex items-center gap-2 px-4 py-3 mb-4 cursor-pointer" style={{ border: `1.5px dashed ${COLORS.inkFaint}`, color: COLORS.inkSoft, borderRadius: R, fontFamily: KLEE, fontSize: 13 }}>
          <Upload size={16} /> {fileName || "CSVファイルを選択"}
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"type,level,word,reading,meaning,meaning_en,example,blank,choice1,choice2,choice3,choice4,answer\nvocab,N4,食事,しょくじ,食べること,meal,家族と食事をします。,,,,,,"}
          rows={8}
          className="w-full px-4 py-3"
          style={{ border: `1.5px solid ${COLORS.hairline}`, fontSize: 13, fontFamily: "monospace", borderRadius: R, background: COLORS.bg, color: COLORS.ink }}
        />
        {error && <div className="mt-3 px-4 py-3" style={{ background: COLORS.vermilionTint, color: COLORS.vermilionDeep, fontSize: 13, borderRadius: R, border: `1.5px solid ${COLORS.vermilion}`, fontFamily: KLEE }}>{error}</div>}
        <div className="flex justify-end mt-4">
          <button onClick={doImport} className="px-5 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: KLEE, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>取り込む</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, lineHeight: 1.8, fontFamily: KLEE }}>
        <div><b>type</b>: vocab（単語）か grammar（文法）</div>
        <div><b>level</b>: N5・N4・N3・N2・N1 のいずれか</div>
        <div><b>vocab行</b>: word, reading, meaning, meaning_en（英語の意味・任意）, example を使用します</div>
        <div><b>grammar行</b>: blank（___を空欄にする）, choice1〜4, answer（正解の番号 1〜4）を使用します</div>
      </div>
    </div>
  );
}

const MODE_KEYS = Object.keys(MODE_TITLES);

export default function App({
  initialVocab,
  initialGrammar,
  initialKakitori,
  initialVocab4Choice,
  initialKanji4Choice,
  initialReading,
  initialReorder,
  studentName,
  onAnswer,
  onSessionEnd,
  onLogout,
  myPageHref,
  allowLocalImport = true,
} = {}) {
  const [vocabList, setVocabList] = useState(initialVocab && initialVocab.length ? initialVocab : SAMPLE_VOCAB);
  const [grammarList, setGrammarList] = useState(initialGrammar && initialGrammar.length ? initialGrammar : SAMPLE_GRAMMAR);
  const [kakitoriList] = useState(initialKakitori && initialKakitori.length ? initialKakitori : KAKITORI_DATA);
  const [vocab4ChoiceList] = useState(initialVocab4Choice && initialVocab4Choice.length ? initialVocab4Choice : SAMPLE_VOCAB4CHOICE);
  const [kanji4ChoiceList] = useState(initialKanji4Choice && initialKanji4Choice.length ? initialKanji4Choice : SAMPLE_KANJI4CHOICE);
  const [readingList] = useState(initialReading && initialReading.length ? initialReading : SAMPLE_READING);
  const [reorderList] = useState(initialReorder && initialReorder.length ? initialReorder : SAMPLE_REORDER);
  const [screen, setScreen] = useState("home");
  const [pendingMode, setPendingMode] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [toast, setToast] = useState(null);
  const [lang, setLang] = useState("ja");
  const [favVocab, setFavVocab] = useState(() => new Set());
  const [favGrammar, setFavGrammar] = useState(() => new Set());
  const [favKakitori, setFavKakitori] = useState(() => new Set());
  const [favVocab4Choice, setFavVocab4Choice] = useState(() => new Set());
  const [favKanji4Choice, setFavKanji4Choice] = useState(() => new Set());
  const [favReading, setFavReading] = useState(() => new Set());
  const [favReorder, setFavReorder] = useState(() => new Set());

  // 「学習回数」のカウンター。③④⑤⑥は1問答えるたびに、①②はカードを1枚進めるたびに+1する。
  // モード・レベルの画面を開いている間の経過時間とあわせて、画面を離れるタイミングでonSessionEndに渡す。
  const reviewCountRef = useRef(0);
  const sessionStartRef = useRef(null);
  const bumpReviewCount = () => { reviewCountRef.current += 1; };

  useEffect(() => {
    const isModeScreen = MODE_KEYS.includes(screen);
    if (isModeScreen) {
      sessionStartRef.current = Date.now();
      reviewCountRef.current = 0;
    }
    return () => {
      if (isModeScreen && sessionStartRef.current) {
        const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
        // 数秒未満（誤操作でモードを開いてすぐ閉じた等）は記録しないようにする
        if (durationSeconds >= 3 && onSessionEnd) {
          onSessionEnd({ mode: screen, level: selectedLevel, durationSeconds, items: reviewCountRef.current });
        }
      }
      sessionStartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedLevel]);

  // 進捗をSupabaseに記録するコールバック（未指定なら何もしない＝チャット内プレビュー時と同じ挙動）
  // あわせて「学習回数」のカウントも進める
  const reportAnswer = (...args) => {
    bumpReviewCount();
    if (onAnswer) onAnswer(...args);
  };

  const toggleFavVocab = (word) => {
    setFavVocab((prev) => {
      const next = new Set(prev);
      next.has(word) ? next.delete(word) : next.add(word);
      return next;
    });
  };
  const toggleFavGrammar = (blank) => {
    setFavGrammar((prev) => {
      const next = new Set(prev);
      next.has(blank) ? next.delete(blank) : next.add(blank);
      return next;
    });
  };
  const toggleFavKakitori = (char) => {
    setFavKakitori((prev) => {
      const next = new Set(prev);
      next.has(char) ? next.delete(char) : next.add(char);
      return next;
    });
  };
  const toggleFavVocab4Choice = (key) => {
    setFavVocab4Choice((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleFavKanji4Choice = (key) => {
    setFavKanji4Choice((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleFavReading = (key) => {
    setFavReading((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleFavReorder = (key) => {
    setFavReorder((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleImport = ({ vocab, grammar, problems }) => {
    if (vocab.length) setVocabList(vocab);
    if (grammar.length) setGrammarList(grammar);
    setFavVocab(new Set());
    setFavGrammar(new Set());
    setToast(`インポート完了：単語${vocab.length}件、文法${grammar.length}件${problems.length ? `（スキップ${problems.length}件）` : ""}`);
    setScreen("home");
    setTimeout(() => setToast(null), 4000);
  };

  const resetSample = () => {
    setVocabList(SAMPLE_VOCAB);
    setGrammarList(SAMPLE_GRAMMAR);
    setFavVocab(new Set());
    setFavGrammar(new Set());
    setToast("サンプルデータに戻しました");
    setTimeout(() => setToast(null), 3000);
  };

  const openMode = (key) => { setPendingMode(key); setScreen("level"); };
  const chooseLevel = (lv) => { setSelectedLevel(lv); setScreen(pendingMode); };
  const backToLevel = () => setScreen("level");
  const backToHome = () => { setPendingMode(null); setSelectedLevel(null); setScreen("home"); };

  const modes = [
    { key: "flashcardReading", title: MODE_TITLES.flashcardReading, desc: "単語を見て読み方を覚える", icon: BookOpen, disabled: vocabList.length === 0 },
    { key: "flashcardMeaning", title: MODE_TITLES.flashcardMeaning, desc: "単語を見て意味を覚える", icon: Languages, disabled: vocabList.length === 0 },
    { key: "vocab4", title: MODE_TITLES.vocab4, desc: "意味を見て単語を選ぶ", icon: ListChecks, disabled: vocabList.length < 4 },
    { key: "kanji", title: MODE_TITLES.kanji, desc: "ひらがなで読み方を入力", icon: Type, disabled: vocabList.length === 0 },
    { key: "grammar4", title: MODE_TITLES.grammar4, desc: "括弧に入る言葉を4択で選ぶ", icon: PenLine, disabled: grammarList.length === 0 },
    { key: "kakitori", title: MODE_TITLES.kakitori, desc: "手書きで漢字を書いて答える", icon: PenTool, disabled: kakitoriList.length === 0 },
    { key: "vocab4choice", title: MODE_TITLES.vocab4choice, desc: "語彙の問題を4択で選ぶ", icon: BookOpenCheck, disabled: vocab4ChoiceList.length === 0 },
    { key: "kanji4choice", title: MODE_TITLES.kanji4choice, desc: "漢字の問題を4択で選ぶ", icon: Hash, disabled: kanji4ChoiceList.length === 0 },
    { key: "reading", title: MODE_TITLES.reading, desc: "文章を読んで設問に答える", icon: BookOpenText, disabled: readingList.length === 0 },
    { key: "reorder", title: MODE_TITLES.reorder, desc: "カードを正しい順番に並べ替える", icon: GripVertical, disabled: reorderList.length === 0 },
  ];

  // レベル選択画面（LevelSelect）に渡すデータソースの定義。モードごとに参照するリスト・お気に入り集合・IDの取り方・必要最低問題数が異なる
  const modeDataMap = {
    flashcardReading: { fullList: vocabList, favSet: favVocab, idOf: (v) => v.word, minRequired: 1 },
    flashcardMeaning: { fullList: vocabList, favSet: favVocab, idOf: (v) => v.word, minRequired: 1 },
    vocab4: { fullList: vocabList, favSet: favVocab, idOf: (v) => v.word, minRequired: 4 },
    kanji: { fullList: vocabList, favSet: favVocab, idOf: (v) => v.word, minRequired: 1 },
    grammar4: { fullList: grammarList, favSet: favGrammar, idOf: (g) => g.blank, minRequired: 1 },
    kakitori: { fullList: kakitoriList, favSet: favKakitori, idOf: (k) => k.char, minRequired: 1 },
    vocab4choice: { fullList: vocab4ChoiceList, favSet: favVocab4Choice, idOf: (q) => q.id || q.blank, minRequired: 1 },
    kanji4choice: { fullList: kanji4ChoiceList, favSet: favKanji4Choice, idOf: (q) => q.id || q.blank, minRequired: 1 },
    reading: { fullList: readingList, favSet: favReading, idOf: (p) => p.id || p.passage, minRequired: 1 },
    reorder: { fullList: reorderList, favSet: favReorder, idOf: (q) => q.id || q.blank, minRequired: 1 },
  };

  const levelVocab =
    selectedLevel === "FAV" ? vocabList.filter((v) => favVocab.has(v.word)) :
    selectedLevel ? vocabList.filter((v) => v.level === selectedLevel) : [];
  const levelGrammar =
    selectedLevel === "FAV" ? grammarList.filter((g) => favGrammar.has(g.blank)) :
    selectedLevel ? grammarList.filter((g) => g.level === selectedLevel) : [];
  const levelKakitori =
    selectedLevel === "FAV" ? kakitoriList.filter((k) => favKakitori.has(k.char)) :
    selectedLevel ? kakitoriList.filter((k) => k.level === selectedLevel) : [];
  const levelVocab4Choice =
    selectedLevel === "FAV" ? vocab4ChoiceList.filter((q) => favVocab4Choice.has(q.id || q.blank)) :
    selectedLevel ? vocab4ChoiceList.filter((q) => q.level === selectedLevel) : [];
  const levelKanji4Choice =
    selectedLevel === "FAV" ? kanji4ChoiceList.filter((q) => favKanji4Choice.has(q.id || q.blank)) :
    selectedLevel ? kanji4ChoiceList.filter((q) => q.level === selectedLevel) : [];
  const levelReading =
    selectedLevel === "FAV" ? readingList.filter((p) => favReading.has(p.id || p.passage)) :
    selectedLevel ? readingList.filter((p) => p.level === selectedLevel) : [];
  const levelReorder =
    selectedLevel === "FAV" ? reorderList.filter((q) => favReorder.has(q.id || q.blank)) :
    selectedLevel ? reorderList.filter((q) => q.level === selectedLevel) : [];

  return (
    <div style={{ background: COLORS.bg, minHeight: 500, fontFamily: SANS, color: COLORS.ink }} className="w-full p-6 kotoba-dojo-root">
      <style>{FONT_IMPORT}</style>
      <style>{DESKTOP_SCALE_CSS}</style>

      {(studentName || onLogout) && (
        <div className="max-w-2xl mx-auto flex items-center justify-between mb-3" style={{ fontFamily: SANS, fontSize: 12, color: COLORS.inkSoft }}>
          <span>{studentName ? `${studentName} さん` : ""}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {screen !== "home" && (
              <button onClick={backToHome} className="flex items-center gap-1.5" style={{ color: COLORS.ink, background: "transparent", border: `1.5px solid ${COLORS.ink}`, borderRadius: R, padding: "7px 14px", fontFamily: SANS, fontSize: 13, fontWeight: 700, lineHeight: 1.2, cursor: "pointer" }}>
                <Home size={18} />
                <span>ホームに戻る</span>
              </button>
            )}
            {myPageHref && (
              <a href={myPageHref} className="flex items-center gap-1.5" style={{ color: COLORS.surface, background: COLORS.indigo, border: `1.5px solid ${COLORS.indigo}`, borderRadius: R, padding: "7px 14px", textDecoration: "none", fontFamily: SANS, fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                <UserCircle size={18} />
                <span>マイアカウント <span style={{ fontWeight: 500, opacity: 0.85 }}>/ My Page</span></span>
              </a>
            )}
            {onLogout && (
              <button onClick={onLogout} style={{ color: COLORS.surface, background: COLORS.vermilionDeep, border: `1.5px solid ${COLORS.vermilionDeep}`, borderRadius: R, padding: "7px 14px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                ログアウト
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="max-w-xl mx-auto mb-4 px-4 py-3 text-center" style={{ background: COLORS.mossTint, color: COLORS.moss, fontSize: 13, border: `1.5px solid ${COLORS.moss}`, borderRadius: R, fontFamily: KLEE }}>
          {toast}
        </div>
      )}

      {screen === "home" && (
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8" style={{ borderBottom: `2px solid ${COLORS.ink}`, paddingBottom: 20 }}>
            <div style={{ fontFamily: SERIF, fontSize: 34, color: COLORS.ink, fontWeight: 800, letterSpacing: "0.03em" }}>
              ことば<span style={{ color: COLORS.vermilion }}>の道場</span>
            </div>
            <div style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 8, fontFamily: SANS, letterSpacing: "0.04em" }}>日本語学習者向け 単語・文法トレーニング（試作版）</div>
            <div style={{ color: COLORS.inkFaint, fontSize: 12, marginTop: 10, fontFamily: SANS }}>単語 {vocabList.length}件 ・ 文法 {grammarList.length}件（N5〜N1）</div>

            <div className="flex items-center justify-center gap-2 mt-4">
              <span style={{ fontFamily: SANS, fontSize: 12, color: COLORS.inkFaint }}>意味の表示言語:</span>
              <div className="flex" style={{ border: `1.5px solid ${COLORS.ink}`, borderRadius: R, overflow: "hidden" }}>
                <button onClick={() => setLang("ja")} style={{ padding: "4px 12px", background: lang === "ja" ? COLORS.ink : "transparent", color: lang === "ja" ? COLORS.surface : COLORS.ink, border: "none", fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>日本語</button>
                <button onClick={() => setLang("en")} style={{ padding: "4px 12px", background: lang === "en" ? COLORS.ink : "transparent", color: lang === "en" ? COLORS.surface : COLORS.ink, border: "none", fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>English</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {modes.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  disabled={m.disabled}
                  onClick={() => openMode(m.key)}
                  className="text-left p-5 flex flex-col gap-3"
                  style={{
                    background: COLORS.surface,
                    border: `1.5px solid ${COLORS.ink}`,
                    opacity: m.disabled ? 0.4 : 1,
                    cursor: m.disabled ? "not-allowed" : "pointer",
                    borderRadius: R,
                    boxShadow: SHADOW,
                  }}
                >
                  <Icon size={22} color={COLORS.vermilion} />
                  <div>
                    <div style={{ fontFamily: m.key === "vocab4" ? SERIF : KLEE, fontSize: 16, fontWeight: 700, color: COLORS.ink }}>{m.title}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 4, fontFamily: SANS }}>{m.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {allowLocalImport && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => setScreen("import")} className="flex items-center gap-1 px-4 py-2" style={{ background: COLORS.ink, color: COLORS.surface, border: `1.5px solid ${COLORS.ink}`, borderRadius: R, fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <FileText size={16} /> CSVから問題を取り込む
              </button>
              <button onClick={resetSample} className="flex items-center gap-1 px-4 py-2" style={{ border: `1.5px solid ${COLORS.ink}`, background: "transparent", color: COLORS.inkSoft, borderRadius: R, fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <RotateCcw size={16} /> サンプルに戻す
              </button>
            </div>
          )}
          {allowLocalImport && (
            <div style={{ fontSize: 11, color: COLORS.inkFaint, textAlign: "center", marginTop: 16, fontFamily: SANS }}>
              ※このプロトタイプはログイン機能がありません。データはページを閉じると消えます。
            </div>
          )}
        </div>
      )}

      {screen === "level" && pendingMode && (
        <LevelSelect
          modeKey={pendingMode}
          fullList={modeDataMap[pendingMode].fullList}
          favSet={modeDataMap[pendingMode].favSet}
          idOf={modeDataMap[pendingMode].idOf}
          minRequired={modeDataMap[pendingMode].minRequired}
          onSelect={chooseLevel}
          onExit={backToHome}
        />
      )}

      {screen === "flashcardReading" && <FlashcardMode vocab={levelVocab} level={selectedLevel} lang={lang} cardMode="reading" favVocab={favVocab} onToggleFav={toggleFavVocab} onCardAdvance={bumpReviewCount} onExit={backToLevel} />}
      {screen === "flashcardMeaning" && <FlashcardMode vocab={levelVocab} level={selectedLevel} lang={lang} cardMode="meaning" favVocab={favVocab} onToggleFav={toggleFavVocab} onCardAdvance={bumpReviewCount} onExit={backToLevel} />}
      {screen === "vocab4" && <Vocab4Mode vocab={levelVocab} level={selectedLevel} lang={lang} favVocab={favVocab} onToggleFav={toggleFavVocab} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "kanji" && <KanjiInputMode vocab={levelVocab} level={selectedLevel} favVocab={favVocab} onToggleFav={toggleFavVocab} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "grammar4" && <GrammarMode grammar={levelGrammar} level={selectedLevel} favGrammar={favGrammar} onToggleFav={toggleFavGrammar} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "kakitori" && <KakitoriMode list={levelKakitori} level={selectedLevel} favSet={favKakitori} onToggleFav={toggleFavKakitori} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "vocab4choice" && <BlankChoiceQuizMode modeKey="vocab4choice" list={levelVocab4Choice} level={selectedLevel} favSet={favVocab4Choice} onToggleFav={toggleFavVocab4Choice} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "kanji4choice" && <BlankChoiceQuizMode modeKey="kanji4choice" list={levelKanji4Choice} level={selectedLevel} favSet={favKanji4Choice} onToggleFav={toggleFavKanji4Choice} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "reading" && <ReadingMode list={levelReading} level={selectedLevel} favSet={favReading} onToggleFav={toggleFavReading} onAnswer={reportAnswer} onExit={backToLevel} />}
      {screen === "reorder" && <ReorderMode list={levelReorder} level={selectedLevel} favSet={favReorder} onToggleFav={toggleFavReorder} onAnswer={reportAnswer} onExit={backToLevel} />}
      {allowLocalImport && screen === "import" && <ImportPanel onImport={handleImport} onExit={backToHome} />}
    </div>
  );
}
