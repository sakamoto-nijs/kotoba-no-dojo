import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます。
// 「教員管理」ページから、オーナーがメンバー（教員）を自分のページから削除する。
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

  const { pageId, teacherId } = req.body || {};
  if (!pageId || !teacherId) return res.status(400).json({ error: "pageId / teacherId は必須です。" });

  const { data: page } = await supabaseAdmin.from("teacher_pages").select("id, owner_id").eq("id", pageId).single();
  if (!page || page.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "このページのオーナーのみ、メンバーを削除できます。" });
  }
  if (teacherId === page.owner_id) {
    return res.status(400).json({ error: "オーナー自身を削除することはできません。" });
  }

  // role='member' の行のみ削除対象にする（誤ってオーナー行を消すことがないようにする安全策）
  const { error: delErr } = await supabaseAdmin
    .from("teacher_page_members")
    .delete()
    .eq("page_id", pageId)
    .eq("teacher_id", teacherId)
    .eq("role", "member");
  if (delErr) return res.status(400).json({ error: `削除に失敗しました: ${delErr.message}` });

  return res.status(200).json({ ok: true });
}
