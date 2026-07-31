import { createClient } from "@supabase/supabase-js";

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

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "セッションが無効です。" });

  const { data: requesterProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (requesterProfile?.role !== "teacher") return res.status(403).json({ error: "教員のみ実行できます。" });

  const { students } = req.body || {};
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: "studentsが空です。" });
  }

  // クラス名 → class_id を解決するためのキャッシュ（無ければ新規作成）
  const { data: existingClasses } = await supabaseAdmin
    .from("classes")
    .select("id, name")
    .eq("teacher_id", userData.user.id);
  const classByName = new Map((existingClasses || []).map((c) => [c.name, c.id]));

  const results = [];
  for (let i = 0; i < students.length; i++) {
    const row = students[i];
    const rowNum = i + 2; // CSVの見出し行を考慮
    const studentCode = (row.studentCode || "").trim();
    const displayName = (row.displayName || "").trim();
    const password = (row.password || "").trim();
    const className = (row.className || "").trim();

    if (!studentCode || !displayName || !password) {
      results.push({ row: rowNum, studentCode, ok: false, error: "学生ID・氏名・パスワードは必須です。" });
      continue;
    }
    if (password.length < 6) {
      results.push({ row: rowNum, studentCode, ok: false, error: "パスワードは6文字以上にしてください。" });
      continue;
    }

    let classId = null;
    if (className) {
      if (classByName.has(className)) {
        classId = classByName.get(className);
      } else {
        const { data: newClass, error: classErr } = await supabaseAdmin
          .from("classes")
          .insert({ teacher_id: userData.user.id, name: className })
          .select("id")
          .single();
        if (!classErr && newClass) {
          classId = newClass.id;
          classByName.set(className, newClass.id);
        }
      }
    }

    const email = studentCodeToEmail(studentCode);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      results.push({ row: rowNum, studentCode, ok: false, error: createErr.message });
      continue;
    }

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      role: "student",
      display_name: displayName,
      student_code: studentCode,
      class_id: classId,
      created_by: userData.user.id,
      current_password_plaintext: password,
    });
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      results.push({ row: rowNum, studentCode, ok: false, error: profileErr.message });
      continue;
    }

    results.push({ row: rowNum, studentCode, ok: true });
  }

  return res.status(200).json({ results });
}
