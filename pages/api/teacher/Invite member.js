import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます（ブラウザには送られません）。
// 「教員管理」ページから、既存の教員アカウント（メールアドレス指定）を
// 自分（オーナー）のページのメンバーとして追加する。
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

  const { pageId, email, canManageStudents, canManageQuestions, canViewDashboard } = req.body || {};
  if (!pageId || !email) return res.status(400).json({ error: "pageId / email は必須です。" });

  // 自分がこのページのオーナーかどうかを確認する（オーナー以外はメンバーを追加できない）
  const { data: page } = await supabaseAdmin.from("teacher_pages").select("id, owner_id").eq("id", pageId).single();
  if (!page || page.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "このページのオーナーのみ、メンバーを追加できます。" });
  }

  // メールアドレスから既存の教員アカウントを探す（学校内の少人数利用を想定し、1ページ分のみ検索する）
  const normalizedEmail = String(email).trim().toLowerCase();
  const { data: usersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return res.status(500).json({ error: `ユーザー検索に失敗しました: ${listErr.message}` });
  const targetUser = (usersPage?.users || []).find((u) => (u.email || "").toLowerCase() === normalizedEmail);
  if (!targetUser) {
    return res.status(404).json({ error: "そのメールアドレスの教員アカウントが見つかりません。先に本人が教員登録を済ませている必要があります。" });
  }

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", targetUser.id)
    .single();
  if (!targetProfile || targetProfile.role !== "teacher") {
    return res.status(400).json({ error: "指定されたアカウントは教員として登録されていません。" });
  }
  if (targetProfile.id === userData.user.id) {
    return res.status(400).json({ error: "自分自身は追加できません（オーナーとして既に含まれています）。" });
  }

  const { data: existing } = await supabaseAdmin
    .from("teacher_page_members")
    .select("page_id, teacher_id")
    .eq("page_id", pageId)
    .eq("teacher_id", targetProfile.id)
    .maybeSingle();
  if (existing) return res.status(400).json({ error: "そのメンバーは既に追加されています。" });

  const { error: insertErr } = await supabaseAdmin.from("teacher_page_members").insert({
    page_id: pageId,
    teacher_id: targetProfile.id,
    role: "member",
    can_manage_students: !!canManageStudents,
    can_manage_questions: !!canManageQuestions,
    can_view_dashboard: !!canViewDashboard,
  });
  if (insertErr) return res.status(400).json({ error: `追加に失敗しました: ${insertErr.message}` });

  return res.status(200).json({ ok: true, member: { id: targetProfile.id, name: targetProfile.display_name } });
}
