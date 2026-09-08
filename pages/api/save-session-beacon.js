import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます（ブラウザには送られません）。
// service_role キーはここでのみ使用し、絶対にフロントエンドのコードには書かないでください。
//
// navigator.sendBeacon はカスタムヘッダー（Authorizationなど）を送れないため、
// タブを閉じる／非表示にする、といった「ページが破棄されようとしている」瞬間に
// study_sessions を記録するための専用ルートとして用意する。
// 認証情報（アクセストークン）は、Authorizationヘッダーではなくリクエストのbody（JSON）に含めて送られてくる。
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { accessToken, studentId, mode, level, items, durationSeconds } = req.body || {};
  if (!accessToken || !studentId || !mode || !level) {
    return res.status(400).json({ error: "必要なパラメータが不足しています。" });
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData?.user) return res.status(401).json({ error: "セッションが無効です。" });

  // トークンの持ち主とstudentIdが一致するか確認する（他人になりすまして記録できないようにする）
  if (userData.user.id !== studentId) {
    return res.status(403).json({ error: "本人以外の学習記録は登録できません。" });
  }

  const { error: insertErr } = await supabaseAdmin.from("study_sessions").insert({
    student_id: studentId,
    mode,
    level,
    items: Number(items) || 0,
    duration_seconds: Number(durationSeconds) || 0,
  });

  if (insertErr) {
    console.error("study_sessions（beacon経由）のinsertに失敗しました:", insertErr);
    return res.status(400).json({ error: `記録に失敗しました: ${insertErr.message}` });
  }

  return res.status(200).json({ ok: true });
}
