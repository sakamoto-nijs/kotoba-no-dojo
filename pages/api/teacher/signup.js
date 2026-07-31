import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます。
// 「合言葉（招待コード）」が一致した場合のみ教員アカウントを作成します。
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, password, inviteCode } = req.body || {};
  if (!name || !email || !password || !inviteCode) {
    return res.status(400).json({ error: "お名前・メールアドレス・パスワード・合言葉はすべて必須です。" });
  }
  if (password.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください。" });

  const expected = process.env.TEACHER_INVITE_CODE;
  if (!expected) {
    // サーバー側の設定漏れ。安全側に倒して常に拒否する。
    return res.status(500).json({ error: "サーバー側の設定が未完了です（TEACHER_INVITE_CODE未設定）。管理者に確認してください。" });
  }
  if (inviteCode !== expected) {
    return res.status(403).json({ error: "合言葉が正しくありません。" });
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) return res.status(400).json({ error: `登録に失敗しました: ${createErr.message}` });

  const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    role: "teacher",
    display_name: name,
  });
  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: `プロフィール作成に失敗しました: ${profileErr.message}` });
  }

  return res.status(200).json({ ok: true });
}
