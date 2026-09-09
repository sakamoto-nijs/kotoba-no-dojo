// 教員は複数の「ページ」（自分専用のページ＋招待されて参加している他の教員のページ）に
// 所属できるため、「今どのページを操作しているか」をブラウザに保存しておき、
// dashboard・students・upload・question-sets・language-settings の各画面で共通して使う。
const STORAGE_KEY = "kotoba_dojo_active_page_id";

export function getStoredPageId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredPageId(pageId) {
  if (typeof window === "undefined") return;
  try {
    if (pageId) window.localStorage.setItem(STORAGE_KEY, pageId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorageが使えない環境では何もしない（次回もページ選択画面が出るだけで、致命的ではない）
  }
}

// ページ名が未設定の場合の自動表示名
export function defaultPageName(ownerName) {
  return `${ownerName || "（教員名未設定）"}先生のダッシュボード`;
}

// 今ログインしている教員が所属している、全ページの一覧を取得する
// （ページ名・オーナーかどうか・権限チェックボックスの状態つき）
export async function fetchMyMemberships(supabase, teacherId) {
  const { data: memberRows } = await supabase
    .from("teacher_page_members")
    .select("page_id, role, can_manage_students, can_manage_questions, can_view_dashboard")
    .eq("teacher_id", teacherId);
  if (!memberRows || memberRows.length === 0) return [];

  const pageIds = memberRows.map((m) => m.page_id);
  const { data: pageRows } = await supabase.from("teacher_pages").select("id, owner_id, page_name").in("id", pageIds);
  const pageById = new Map((pageRows || []).map((p) => [p.id, p]));

  const ownerIds = Array.from(new Set((pageRows || []).map((p) => p.owner_id)));
  const { data: ownerProfiles } = ownerIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
    : { data: [] };
  const ownerNameById = new Map((ownerProfiles || []).map((p) => [p.id, p.display_name]));

  return memberRows.map((m) => {
    const page = pageById.get(m.page_id);
    const ownerName = page ? ownerNameById.get(page.owner_id) : "";
    return {
      pageId: m.page_id,
      role: m.role,
      canManageStudents: !!m.can_manage_students,
      canManageQuestions: !!m.can_manage_questions,
      canViewDashboard: !!m.can_view_dashboard,
      pageName: (page && page.page_name) || defaultPageName(ownerName),
      isOwn: page ? page.owner_id === teacherId : false,
    };
  });
}

// 現在の「操作対象ページ」を解決する。
// - 所属ページが1つだけなら、自動的にそれを選択して保存する
// - 2つ以上あり、保存済みの選択が有効ならそれを使う
// - 2つ以上あり、有効な保存済みの選択が無ければ、選択画面へ誘導する必要があることを伝える
export async function resolveActivePage(supabase, teacherId) {
  const memberships = await fetchMyMemberships(supabase, teacherId);
  if (memberships.length === 0) {
    return { needsSelection: false, page: null, memberships };
  }
  if (memberships.length === 1) {
    setStoredPageId(memberships[0].pageId);
    return { needsSelection: false, page: memberships[0], memberships };
  }
  const stored = getStoredPageId();
  const found = memberships.find((m) => m.pageId === stored);
  if (found) return { needsSelection: false, page: found, memberships };
  return { needsSelection: true, page: null, memberships };
}

// page（resolveActivePageやfetchMyMembershipsが返す1件）に対して、
// 指定した操作（'students' | 'questions' | 'view'）を行う権限があるかどうかを判定する
export function hasPermission(page, perm) {
  if (!page) return false;
  if (page.role === "owner") return true;
  if (perm === "students") return !!page.canManageStudents;
  if (perm === "questions") return !!page.canManageQuestions;
  if (perm === "view") return !!(page.canViewDashboard || page.canManageStudents || page.canManageQuestions);
  return false;
}
