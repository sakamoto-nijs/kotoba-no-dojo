import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます（ブラウザには送られません）。
// service_role キーはここでのみ使用し、絶対にフロントエンドのコードには書かないでください。
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "認証が必要です。" });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "セッションが無効です。" });

  const { data: requesterProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (requesterProfile?.role !== "teacher") return res.status(403).json({ error: "教員のみ実行できます。" });

  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: "studentId は必須です。" });

  // その学生が本当にこの教員が発行した学生かどうかを確認（他の教員の学生を勝手に削除できないように）
  const { data: studentProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, created_by, role")
    .eq("id", studentId)
    .single();
  if (!studentProfile || studentProfile.role !== "student" || studentProfile.created_by !== userData.user.id) {
    return res.status(403).json({ error: "自分が発行した学生のみ削除できます。" });
  }

  // 認証アカウントを削除すると、profiles（on delete cascade）経由で progress / study_sessions も連鎖して削除される
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(studentId);
  if (deleteErr) return res.status(400).json({ error: `削除に失敗しました: ${deleteErr.message}` });

  return res.status(200).json({ ok: true });
}
