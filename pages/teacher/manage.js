import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

const PERMISSION_FIELDS = [
  { key: "canManageStudents", dbKey: "can_manage_students", label: "生徒・クラスの管理", desc: "学生の追加・削除・パスワード再設定、クラスの作成・削除ができます。" },
  { key: "canManageQuestions", dbKey: "can_manage_questions", label: "問題・言語設定の管理", desc: "問題CSVのアップロード、問題セット名、意味表示言語の設定ができます。" },
  { key: "canViewDashboard", dbKey: "can_view_dashboard", label: "ダッシュボードの閲覧", desc: "学生の成績・学習状況の確認、CSVダウンロードができます。" },
];

function emptyPermissions() {
  return { canManageStudents: false, canManageQuestions: false, canViewDashboard: false };
}

function sectionStyle() {
  return { background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, padding: 20, marginBottom: 20 };
}
const inputStyle = { width: "100%", padding: "9px 11px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13.5 };
const labelStyle = { fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 4 };
const primaryBtn = { padding: "9px 18px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const dangerBtn = { padding: "6px 12px", background: "transparent", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion-deep)", borderRadius: R, fontSize: 12, cursor: "pointer" };

export default function TeacherManage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const [page, setPage] = useState(null); // { id, page_name }
  const [pageNameInput, setPageNameInput] = useState("");
  const [pageNameSaving, setPageNameSaving] = useState(false);

  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);

  const [members, setMembers] = useState([]); // [{ teacher_id, role, display_name, ...permissions }]
  const [memberBusyId, setMemberBusyId] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState(emptyPermissions());
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess) { router.replace("/teacher/login"); return; }
      const { data: me } = await supabase.from("profiles").select("*").eq("id", sess.user.id).single();
      if (!me || me.role !== "teacher") { router.replace("/teacher/login"); return; }

      setSession(sess);
      setMyName(me.display_name || "");
      setMyEmail(sess.user.email || "");

      await loadPageAndMembers(sess);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadPageAndMembers = async (sess) => {
    const { data: pageRow, error: pageErr } = await supabase
      .from("teacher_pages")
      .select("id, page_name")
      .eq("owner_id", sess.user.id)
      .single();
    if (pageErr || !pageRow) {
      setError("自分のページが見つかりませんでした。時間をおいて再度お試しください。");
      return;
    }
    setPage(pageRow);
    setPageNameInput(pageRow.page_name || "");

    const { data: memberRows } = await supabase
      .from("teacher_page_members")
      .select("teacher_id, role, can_manage_students, can_manage_questions, can_view_dashboard, joined_at")
      .eq("page_id", pageRow.id)
      .order("joined_at", { ascending: true });

    const teacherIds = (memberRows || []).map((m) => m.teacher_id);
    let nameById = new Map();
    if (teacherIds.length) {
      const { data: profileRows } = await supabase.from("profiles").select("id, display_name").in("id", teacherIds);
      nameById = new Map((profileRows || []).map((p) => [p.id, p.display_name]));
    }
    setMembers(
      (memberRows || []).map((m) => ({
        ...m,
        display_name: nameById.get(m.teacher_id) || "（不明な教員）",
      }))
    );
  };

  const defaultPageName = myName ? `${myName}先生のダッシュボード` : "（教員名未設定）先生のダッシュボード";

  const handleSavePageName = async () => {
    if (!page) return;
    setPageNameSaving(true);
    setError(null); setMsg(null);
    try {
      const trimmed = pageNameInput.trim();
      const { error: updErr } = await supabase
        .from("teacher_pages")
        .update({ page_name: trimmed || null })
        .eq("id", page.id);
      if (updErr) throw updErr;
      setPage((p) => ({ ...p, page_name: trimmed || null }));
      setMsg("ページ名を保存しました。");
    } catch (e) {
      setError(`ページ名の保存に失敗しました: ${e.message || e}`);
    } finally {
      setPageNameSaving(false);
    }
  };

  const handleSaveAccount = async () => {
    setAccountSaving(true);
    setError(null); setMsg(null);
    try {
      if (myNewPassword && myNewPassword.length < 6) {
        throw new Error("パスワードは6文字以上にしてください。");
      }
      const res = await fetch("/api/teacher/update-self-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          displayName: myName.trim() || undefined,
          email: myEmail.trim() || undefined,
          newPassword: myNewPassword || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "更新に失敗しました。");
      setMyNewPassword("");
      setMsg("登録情報を更新しました。メールアドレスを変更した場合、次回ログインからは新しいメールアドレスを使用してください。");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!page) return;
    setInviting(true);
    setError(null); setMsg(null);
    try {
      if (!inviteEmail.trim()) throw new Error("メールアドレスを入力してください。");
      const res = await fetch("/api/teacher/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          pageId: page.id,
          email: inviteEmail.trim(),
          canManageStudents: invitePerms.canManageStudents,
          canManageQuestions: invitePerms.canManageQuestions,
          canViewDashboard: invitePerms.canViewDashboard,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "追加に失敗しました。");
      setMsg(`${json.member?.name || "教員"}さんをメンバーに追加しました。`);
      setInviteEmail("");
      setInvitePerms(emptyPermissions());
      await loadPageAndMembers(session);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setInviting(false);
    }
  };

  const handleTogglePermission = async (member, dbKey, checked) => {
    setMemberBusyId(member.teacher_id);
    setError(null); setMsg(null);
    try {
      const next = {
        canManageStudents: dbKey === "can_manage_students" ? checked : member.can_manage_students,
        canManageQuestions: dbKey === "can_manage_questions" ? checked : member.can_manage_questions,
        canViewDashboard: dbKey === "can_view_dashboard" ? checked : member.can_view_dashboard,
      };
      const res = await fetch("/api/teacher/update-member-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pageId: page.id, teacherId: member.teacher_id, ...next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "更新に失敗しました。");
      setMembers((prev) =>
        prev.map((m) =>
          m.teacher_id === member.teacher_id
            ? { ...m, can_manage_students: next.canManageStudents, can_manage_questions: next.canManageQuestions, can_view_dashboard: next.canViewDashboard }
            : m
        )
      );
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setMemberBusyId(null);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`${member.display_name}さんをこのページのメンバーから削除しますか？`)) return;
    setMemberBusyId(member.teacher_id);
    setError(null); setMsg(null);
    try {
      const res = await fetch("/api/teacher/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pageId: page.id, teacherId: member.teacher_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "削除に失敗しました。");
      setMembers((prev) => prev.filter((m) => m.teacher_id !== member.teacher_id));
      setMsg("メンバーを削除しました。");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setMemberBusyId(null);
    }
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}>読み込み中…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>教員管理</div>
          <a href="/teacher/dashboard" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← ダッシュボードへ戻る</a>
        </div>

        {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {msg && <div style={{ background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

        {/* ページ名設定 */}
        <div style={sectionStyle()}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>ページ名</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.7 }}>
            教員がログインした際に表示される、このページの名前です。空欄のままにすると「{defaultPageName}」が自動的に表示されます。
          </div>
          <label style={labelStyle}>ページ名（任意）</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={pageNameInput}
              onChange={(e) => setPageNameInput(e.target.value)}
              placeholder={defaultPageName}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSavePageName} disabled={pageNameSaving} style={{ ...primaryBtn, opacity: pageNameSaving ? 0.6 : 1 }}>
              {pageNameSaving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>

        {/* 自分の登録情報 */}
        <div style={sectionStyle()}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>自分の登録情報</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.7 }}>
            ここで変更できるのはご自身（{myName || "教員"}さん）の登録情報のみです。他の教員の登録情報はここからは変更できません。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>お名前</label>
              <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>メールアドレス</label>
              <input type="email" value={myEmail} onChange={(e) => setMyEmail(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>新しいパスワード（変更する場合のみ入力・6文字以上）</label>
              <input type="password" value={myNewPassword} onChange={(e) => setMyNewPassword(e.target.value)} placeholder="変更しない場合は空欄のまま" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button onClick={handleSaveAccount} disabled={accountSaving} style={{ ...primaryBtn, opacity: accountSaving ? 0.6 : 1 }}>
              {accountSaving ? "保存中…" : "登録情報を保存"}
            </button>
          </div>
        </div>

        {/* メンバー一覧 */}
        <div style={sectionStyle()}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>メンバー一覧</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14, lineHeight: 1.7 }}>
            このページを一緒に管理できる教員の一覧です。オーナー（{myName || "自分"}さん）は常に全ての権限を持ちます。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {members.map((m) => (
              <div key={m.teacher_id} style={{ border: "1.5px solid var(--hairline)", borderRadius: R, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: m.role === "owner" ? 0 : 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {m.display_name}
                    {m.role === "owner" && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--indigo)", fontWeight: 700 }}>オーナー</span>}
                  </div>
                  {m.role !== "owner" && (
                    <button onClick={() => handleRemoveMember(m)} disabled={memberBusyId === m.teacher_id} style={dangerBtn}>
                      削除
                    </button>
                  )}
                </div>
                {m.role !== "owner" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PERMISSION_FIELDS.map((f) => (
                      <label key={f.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--ink-soft)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!!m[f.dbKey]}
                          disabled={memberBusyId === m.teacher_id}
                          onChange={(e) => handleTogglePermission(m, f.dbKey, e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span>
                          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{f.label}</span>
                          <br />
                          {f.desc}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* メンバー追加 */}
        <div style={sectionStyle()}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>新しいメンバーを追加</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14, lineHeight: 1.7 }}>
            追加できるのは、既に教員登録を済ませているアカウントのみです。メールアドレスを指定すると、その場でメンバーに追加されます（承認は不要です）。
          </div>
          <label style={labelStyle}>教員のメールアドレス</label>
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="tanaka@example.com"
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {PERMISSION_FIELDS.map((f) => (
              <label key={f.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--ink-soft)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={invitePerms[f.key]}
                  onChange={(e) => setInvitePerms((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{f.label}</span>
                  <br />
                  {f.desc}
                </span>
              </label>
            ))}
          </div>
          <div style={{ textAlign: "right" }}>
            <button onClick={handleInvite} disabled={inviting} style={{ ...primaryBtn, opacity: inviting ? 0.6 : 1 }}>
              {inviting ? "追加中…" : "メンバーに追加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
