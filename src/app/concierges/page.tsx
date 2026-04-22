"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, CheckCircle2, Bot, RefreshCw, Trash2 } from "lucide-react";
import type { Concierge } from "@/lib/nocodb";

const EMPTY_FORM = {
  display_name: "",
  description: "",
  persona_label: "",
  intercom_admin_id: "",
  policy_set_key: "",
  skill_profile_key: "",
  source_priority_profile_key: "",
  notes: "",
  is_test_only: false,
};

function getStatusBadge(c: Concierge): { variant: "success" | "warning" | "muted"; label: string } {
  if (!c.is_active) return { variant: "muted", label: "inactive" };
  if (c.is_test_only) return { variant: "warning", label: "test only" };
  return { variant: "success", label: "active" };
}

export default function ConciergePage() {
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [noTable, setNoTable]       = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/concierges");
    const data = await res.json();
    if (data.list !== undefined) {
      setConcierges(data.list);
    } else {
      setNoTable(true);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.display_name) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/concierges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          concierge_key: `concierge_${Date.now()}`,
          is_main: false,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ?? `保存失敗 (HTTP ${res.status})`);
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setSaveError(`ネットワークエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("このコンシェルジュを削除しますか？")) return;
    await fetch("/api/concierges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Id: id }),
    });
    load();
  };

  const toggleActive = async (c: Concierge) => {
    await fetch("/api/concierges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Id: c.Id, is_active: !c.is_active }),
    });
    load();
  };

  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Concierges</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">サポートコンシェルジュ登録・管理</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(f => !f)}>
            <Plus size={13} /> 追加
          </Button>
        </div>
      </div>

      {noTable && (
        <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800 font-medium">NocoDB テーブル未設定</p>
          <p className="text-xs text-amber-700 mt-1">
            <code>support_ai_concierges</code> テーブルを作成し、<code>NOCODB_CONCIERGES_TABLE_ID</code> を環境変数に設定してください。
          </p>
        </div>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle>新しいコンシェルジュを追加</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">表示名 *</label>
                <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="例: Ptengine サポート"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Intercom Admin ID</label>
                <input value={form.intercom_admin_id} onChange={e => setForm(f => ({ ...f, intercom_admin_id: e.target.value }))}
                  placeholder="例: 7654321"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">ペルソナラベル</label>
              <input value={form.persona_label} onChange={e => setForm(f => ({ ...f, persona_label: e.target.value }))}
                placeholder="例: 丁寧・保守的"
                className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">説明</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="このコンシェルジュの用途・特徴"
                className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Policy Set Key</label>
                <input value={form.policy_set_key} onChange={e => setForm(f => ({ ...f, policy_set_key: e.target.value }))}
                  placeholder="例: default"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Skill Profile Key</label>
                <input value={form.skill_profile_key} onChange={e => setForm(f => ({ ...f, skill_profile_key: e.target.value }))}
                  placeholder="例: default"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Source Priority Key</label>
                <input value={form.source_priority_profile_key} onChange={e => setForm(f => ({ ...f, source_priority_profile_key: e.target.value }))}
                  placeholder="例: default"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={form.is_test_only} onChange={e => setForm(f => ({ ...f, is_test_only: e.target.checked }))}
                className="rounded border-[var(--border)]" />
              テスト専用（本番会話には使わない）
            </label>
            {saveError && (
              <div className="p-2.5 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
                {saveError}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={add} disabled={saving || !form.display_name}>
                {saving ? "保存中…" : "追加する"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setSaveError(null); }}>キャンセル</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="h-20 bg-zinc-100 rounded animate-pulse" />
                </CardContent>
              </Card>
            ))
          : concierges.map(c => {
              const { variant, label } = getStatusBadge(c);
              return (
                <Card key={c.Id}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        <Bot size={16} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{c.display_name}</span>
                          {c.is_main && (
                            <span className="flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                              <CheckCircle2 size={10} /> メイン
                            </span>
                          )}
                          <Badge variant={variant}>{label}</Badge>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-3">
                          {c.persona_label ? `[${c.persona_label}]` : ""}{c.description ? ` ${c.description}` : ""}
                          {!c.persona_label && !c.description && "説明未設定"}
                        </p>
                        <div className="grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Intercom Admin ID</p>
                            <p className="text-[var(--text-secondary)] font-mono text-[10px]">{c.intercom_admin_id || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Policy Set</p>
                            <p className="text-[var(--text-secondary)] font-mono text-[10px]">{c.policy_set_key || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Skill Profile</p>
                            <p className="text-[var(--text-secondary)] font-mono text-[10px]">{c.skill_profile_key || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Source Priority</p>
                            <p className="text-[var(--text-secondary)] font-mono text-[10px]">{c.source_priority_profile_key || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!c.is_main && (
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                            {c.is_active ? "無効化" : "有効化"}
                          </Button>
                        )}
                        {!c.is_main && (
                          <Button variant="ghost" size="sm" onClick={() => remove(c.Id)}>
                            <Trash2 size={13} className="text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        {!loading && concierges.length === 0 && !noTable && (
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">
            コンシェルジュが登録されていません
          </div>
        )}
      </div>

      <div className="mt-5 p-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <div className="flex items-start gap-2">
          <Users size={14} className="text-zinc-400 mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--text-muted)]">
            複数コンシェルジュ登録・切り替えには Intercom の Bot Admin アカウントがそれぞれ必要です。
            <code>policy_set_key</code> / <code>skill_profile_key</code> / <code>source_priority_profile_key</code> は
            Bot 設定ファイル（md）のプロファイルキーと対応します。
          </p>
        </div>
      </div>
    </div>
  );
}
