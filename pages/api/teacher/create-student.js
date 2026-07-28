import { createClient } from "@supabase/supabase-js";

// このファイルはサーバー上でのみ実行されます（ブラウザには送られません）。
// service_role キーはここでのみ使用し、絶対にフロントエンドのコードには書かないでください。
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function studentCodeToEmail(studentCode) {
  return `${studentCode.trim().toLowerCase()}@kotoba-dojo.local`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "認証が必要です。" });

  // リクエストしてきたのが本当に教員かどうかを確認
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "セッションが無効です。" });

  const { data: requesterProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (requesterProfile?.role !== "teacher") return res.status(403).json({ error: "教員のみ実行できます。" });

  const { studentCode, password, displayName, classId } = req.body || {};
  if (!studentCode || !password || !displayName) {
    return res.status(400).json({ error: "studentCode / password / displayName は必須です。" });
  }
  if (password.length < 6) return res.status(400).json({ error: "パスワードは6文字以上にしてください。" });

  const email = studentCodeToEmail(studentCode);

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) return res.status(400).json({ error: `アカウント作成に失敗しました: ${createErr.message}` });

  const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    role: "student",
    display_name: displayName,
    student_code: studentCode.trim(),
    class_id: classId || null,
    created_by: userData.user.id,
  });
  if (profileErr) {
    // プロフィール作成に失敗した場合は認証アカウントも削除して整合性を保つ
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: `プロフィール作成に失敗しました: ${profileErr.message}` });
  }

  return res.status(200).json({ ok: true, studentCode: studentCode.trim() });
}
