import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/fetchAllRows";

const R = "3px";
const SHADOW = "0 2px 0 rgba(36,31,26,0.10)";
const SLOT_MAX = 10;

function emptySlots() {
  const slots = {};
  for (let s = 1; s <= SLOT_MAX; s++) slots[s] = { name: "", visible: true };
  return slots;
}

export default function LanguageSettings() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [slots, setSlots] = useState(emptySlots());
  const [original, setOriginal] = useState(emptySlots());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/teacher/login"); return; }
      setSession(session);
      await loadData(session);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadData = async (sess) => {
    setLoading(true);
    setError(null); setMsg(null);
    try {
      const rows = await fetchAllRows(() =>
        supabase.from("meaning_languages").select("slot, language_name, visible").eq("teacher_id", sess.user.id)
      );
      const next = emptySlots();
      (rows || []).forEach((r) => { next[r.slot] = { name: r.language_name || "", visible: r.visible }; });
      setSlots(next);
      setOriginal(next);
    } catch (e) {
      setError(`読み込みに失敗しました: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (slot, name) => {
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], name } }));
  };
  const handleVisibleChange = (slot, visible) => {
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], visible } }));
  };

  const hasChanges = Array.from({ length: SLOT_MAX }, (_, i) => i + 1).some((s) => {
    const a = slots[s], b = original[s];
    return (a.name || "").trim() !== (b.name || "").trim() || a.visible !== b.visible;
  });

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null); setMsg(null);
    try {
      const toUpsert = [];
      const toDeleteSlots = [];
      for (let s = 1; s <= SLOT_MAX; s++) {
        const name = (slots[s].name || "").trim();
        const visible = slots[s].visible;
        const wasSet = (original[s].name || "").trim();
        if (name === wasSet && visible === original[s].visible) continue; // 変更なし
        if (name) {
          toUpsert.push({ teacher_id: session.user.id, slot: s, language_name: name, visible, updated_at: new Date().toISOString() });
        } else if (wasSet) {
          toDeleteSlots.push(s);
        }
      }
      if (toUpsert.length) {
        const { error: upErr } = await supabase.from("meaning_languages").upsert(toUpsert, { onConflict: "teacher_id,slot" });
        if (upErr) throw upErr;
      }
      if (toDeleteSlots.length) {
        const { error: delErr } = await supabase.from("meaning_languages").delete()
          .eq("teacher_id", session.user.id).in("slot", toDeleteSlots);
        if (delErr) throw delErr;
      }
      setOriginal(slots);
      setMsg("保存しました。");
    } catch (e) {
      setError(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 22, fontWeight: 800 }}>言語設定</div>
          <a href="/teacher/dashboard" style={{ fontSize: 13, color: "var(--ink-soft)" }}>← ダッシュボードへ戻る</a>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.8 }}>
          CSVの<code>meaning_1</code>〜<code>meaning_10</code>列が、それぞれ何語なのかをここで設定します。「学生に表示する」をオンにした言語だけが、学生画面の「意味の表示言語」の選択肢に表示されます。言語名を空欄のままにすると、その枠は使われません（学生の選択肢にも表示されません）。
        </div>

        {error && <div style={{ background: "var(--vermilion-tint)", color: "var(--vermilion-deep)", border: "1.5px solid var(--vermilion)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {msg && <div style={{ background: "var(--moss-tint)", color: "var(--moss)", border: "1.5px solid var(--moss)", borderRadius: R, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--ink-soft)", padding: "40px 0" }}>読み込み中…</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {Array.from({ length: SLOT_MAX }, (_, i) => i + 1).map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1.5px solid var(--hairline)", borderRadius: R, background: "var(--surface)" }}>
                  <div style={{ width: 92, fontSize: 12, color: "var(--ink-soft)", fontFamily: "monospace" }}>meaning_{s}</div>
                  <input
                    type="text"
                    value={slots[s].name}
                    onChange={(e) => handleNameChange(s, e.target.value)}
                    placeholder="言語名（例: 英語）"
                    style={{ flex: 1, padding: "8px 10px", border: "1.5px solid var(--hairline)", borderRadius: R, fontSize: 13 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={slots[s].visible}
                      onChange={(e) => handleVisibleChange(s, e.target.checked)}
                    />
                    学生に表示する
                  </label>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", bottom: 16 }}>
              <button
                onClick={handleSaveAll}
                disabled={!hasChanges || saving}
                style={{ padding: "10px 24px", background: "var(--ink)", color: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: R, fontWeight: 600, fontSize: 13, cursor: hasChanges && !saving ? "pointer" : "not-allowed", opacity: hasChanges && !saving ? 1 : 0.5, boxShadow: SHADOW }}
              >
                {saving ? "保存中…" : "保存する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
