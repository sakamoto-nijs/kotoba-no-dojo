import { createClient } from "@supabase/supabase-js";
import { checkPagePermission } from "../../../lib/pagePermissions";
import { studentCodeToEmail } from "../../../lib/supabaseClient";

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

  const { studentId, studentCode, displayName, classId } = req.body || {};
  if (!studentId || !studentCode || !displayName) {
    return res.status(400).json({ error: "studentId / studentCode / displayName は必須です。" });
  }

  // その学生が本当に自分の所属ページの学生かどうか、'students'権限があるかを確認する
  // （他のページの学生の情報を勝手に変更できないように）
  const { data: studentProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, page_id, role, student_code")
    .eq("id", studentId)
    .single();
  if (!studentProfile || studentProfile.role !== "student" || !studentProfile.page_id) {
    return res.status(403).json({ error: "指定された学生が見つかりません。" });
  }
  const allowed = await checkPagePermission(supabaseAdmin, studentProfile.page_id, userData.user.id, "students");
  if (!allowed) return res.status(403).json({ error: "この学生の情報を変更する権限がありません。" });

  // classIdを指定する場合、そのクラスが同じページのものであることを確認する（他ページへの誤紐付け防止）
  if (classId) {
    const { data: classRow } = await supabaseAdmin.from("classes").select("id, page_id").eq("id", classId).single();
    if (!classRow || classRow.page_id !== studentProfile.page_id) {
      return res.status(400).json({ error: "指定されたクラスがこのページのものではありません。" });
    }
  }

  const trimmedCode = studentCode.trim();

  // 学生IDはログイン用のメールアドレス（studentCode@kotoba-dojo.local）の元になっているため、
  // 学生IDを変更する場合は、認証側のメールアドレスも合わせて更新する（そうしないと新IDでログインできなくなる）
  if (trimmedCode.toLowerCase() !== (studentProfile.student_code || "").toLowerCase()) {
    const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
      email: studentCodeToEmail(trimmedCode),
    });
    if (emailErr) {
      const dup = /already|registered|exists/i.test(emailErr.message || "");
      return res.status(400).json({ error: dup ? "その学生IDは既に使われています。" : `学生IDの変更に失敗しました: ${emailErr.message}` });
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ display_name: displayName.trim(), student_code: trimmedCode, class_id: classId || null })
    .eq("id", studentId);
  if (updateErr) {
    const dup = updateErr.code === "23505";
    return res.status(400).json({ error: dup ? "その学生IDは既に使われています。" : `更新に失敗しました: ${updateErr.message}` });
  }

  return res.status(200).json({ ok: true });
}
