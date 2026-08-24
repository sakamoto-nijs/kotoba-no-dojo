import { createClient } from "@supabase/supabase-js";

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

  const { studentId, newPassword } = req.body || {};
  if (!studentId || !newPassword) return res.status(400).json({ error: "studentId / newPassword は必須です。" });
  if (newPassword.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください。" });

  // その学生が本当にこの教員が発行した学生かどうかを確認（他の教員の学生を勝手に変更できないように）
  const { data: studentProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, created_by, role")
    .eq("id", studentId)
    .single();
  if (!studentProfile || studentProfile.role !== "student" || studentProfile.created_by !== userData.user.id) {
    return res.status(403).json({ error: "自分が発行した学生のみパスワードを再設定できます。" });
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, { password: newPassword });
  if (updateErr) return res.status(400).json({ error: `パスワード再設定に失敗しました: ${updateErr.message}` });

  await supabaseAdmin.from("profiles").update({ current_password_plaintext: newPassword }).eq("id", studentId);

  return res.status(200).json({ ok: true });
}
