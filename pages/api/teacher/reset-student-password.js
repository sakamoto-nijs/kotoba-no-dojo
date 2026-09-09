import { createClient } from "@supabase/supabase-js";
import { checkPagePermission } from "../../../lib/pagePermissions";

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

  // その学生が本当に自分の所属ページの学生かどうか、'students'権限があるかを確認する
  // （他のページの学生のパスワードを勝手に変更できないように）
  const { data: studentProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, page_id, role")
    .eq("id", studentId)
    .single();
  if (!studentProfile || studentProfile.role !== "student" || !studentProfile.page_id) {
    return res.status(403).json({ error: "指定された学生が見つかりません。" });
  }
  const allowed = await checkPagePermission(supabaseAdmin, studentProfile.page_id, userData.user.id, "students");
  if (!allowed) return res.status(403).json({ error: "このパスワードを再設定する権限がありません。" });

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, { password: newPassword });
  if (updateErr) return res.status(400).json({ error: `パスワード再設定に失敗しました: ${updateErr.message}` });

  await supabaseAdmin.from("profiles").update({ current_password_plaintext: newPassword }).eq("id", studentId);

  return res.status(200).json({ ok: true });
}
