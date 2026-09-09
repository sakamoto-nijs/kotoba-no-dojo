import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます。
// 「教員管理」ページから、教員本人が自分の登録情報（名前・メールアドレス・パスワード）を変更する。
// メール確認フローを挟まず即時反映するため、（学生のパスワード再設定と同様に）
// service_roleキーを使って auth.admin.updateUserById で直接更新する。
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

  const { displayName, email, newPassword } = req.body || {};
  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: "パスワードは6文字以上にしてください。" });
  }
  if (!displayName && !email && !newPassword) {
    return res.status(400).json({ error: "変更する項目がありません。" });
  }

  const authUpdates = {};
  if (email) authUpdates.email = email;
  if (newPassword) authUpdates.password = newPassword;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, authUpdates);
    if (authUpdateErr) return res.status(400).json({ error: `更新に失敗しました: ${authUpdateErr.message}` });
  }

  if (displayName) {
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userData.user.id);
    if (profileErr) return res.status(400).json({ error: `プロフィール更新に失敗しました: ${profileErr.message}` });
  }

  return res.status(200).json({ ok: true });
}
