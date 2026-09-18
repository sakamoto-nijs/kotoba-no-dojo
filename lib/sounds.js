// 正解・不正解の効果音を、音声ファイルを使わずWeb Audio APIでその場で合成する。
// 音声ファイルを追加でホスティング・管理する必要が無く、読み込み待ちも発生しない。

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null; // 対応していない環境では何もしない
  if (!audioCtx) audioCtx = new Ctx();
  // ブラウザによっては、生成直後や非表示タブ復帰後にsuspended状態になることがあるため、
  // 再生のたびにresumeを試みる（ユーザーの操作＝クリックの延長で呼ばれるため許可される）。
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTone(ctx, { freq, start, duration, type = "sine", peakGain = 0.25, glideTo = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, start + duration);
  // 急に鳴り始めて急に消える「プツッ」というノイズを避けるため、ごく短い立ち上がり・立ち下がりを付ける
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// 正解音「ピンポーン」：明るい2音の上昇チャイム
export function playCorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, { freq: 880, start: now, duration: 0.16, type: "sine", peakGain: 0.28 });
    playTone(ctx, { freq: 1318.5, start: now + 0.15, duration: 0.3, type: "sine", peakGain: 0.28 });
  } catch {
    // 効果音の再生に失敗しても、学習自体には影響させない
  }
}

// 不正解音「ブー」：低めのブザー音（少し下がっていく）
export function playIncorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, { freq: 180, glideTo: 100, start: now, duration: 0.35, type: "sawtooth", peakGain: 0.2 });
  } catch {
    // 効果音の再生に失敗しても、学習自体には影響させない
  }
}
