import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます。
// 「教員管理」ページから、オーナーがメンバー（教員）の権限チェックボックスを更新する。
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

  const { pageId, teacherId, canManageStudents, canManageQuestions, canViewDashboard } = req.body || {};
  if (!pageId || !teacherId) return res.status(400).json({ error: "pageId / teacherId は必須です。" });

  const { data: page } = await supabaseAdmin.from("teacher_pages").select("id, owner_id").eq("id", pageId).single();
  if (!page || page.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "このページのオーナーのみ、権限を変更できます。" });
  }
  if (teacherId === page.owner_id) {
    return res.status(400).json({ error: "オーナー自身の権限は変更できません（常に全権限があります）。" });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("teacher_page_members")
    .update({
      can_manage_students: !!canManageStudents,
      can_manage_questions: !!canManageQuestions,
      can_view_dashboard: !!canViewDashboard,
    })
    .eq("page_id", pageId)
    .eq("teacher_id", teacherId)
    .eq("role", "member");
  if (updateErr) return res.status(400).json({ error: `更新に失敗しました: ${updateErr.message}` });

  return res.status(200).json({ ok: true });
}
