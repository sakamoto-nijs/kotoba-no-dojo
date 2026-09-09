import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { fetchMyMemberships, setStoredPageId } from "../../lib/currentPage";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";

export default function SelectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (!me || me.role !== "teacher") { router.replace("/teacher/login"); return; }

      const list = await fetchMyMemberships(supabase, session.user.id);
      if (list.length === 0) {
        setError("所属しているページが見つかりませんでした。時間をおいて再度お試しいただくか、管理者にご確認ください。");
        setLoading(false);
        return;
      }
      if (list.length === 1) {
        setStoredPageId(list[0].pageId);
        router.replace("/teacher/dashboard");
        return;
      }
      setMemberships(list);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const choose = (pageId) => {
    setStoredPageId(pageId);
    router.replace("/teacher/dashboard");
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}>読み込み中…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>どちらのページを開きますか？</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>複数のページに所属しています。操作するページを選んでください。</div>
        </div>

        {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {memberships.map((m) => (
            <button
              key={m.pageId}
              onClick={() => choose(m.pageId)}
              style={{ textAlign: "left", padding: "16px 18px", background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, boxShadow: SHADOW, cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span>{m.pageName}</span>
              {m.role === "owner" && <span style={{ fontSize: 11, color: "var(--indigo)", fontWeight: 700 }}>オーナー</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
