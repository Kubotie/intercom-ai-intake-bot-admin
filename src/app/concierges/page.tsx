"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, CheckCircle2, Bot, RefreshCw, Trash2, Pencil, X } from "lucide-react";
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
  is_main: false,
};

type FormState = typeof EMPTY_FORM;

function conciergeToForm(c: Concierge): FormState {
  return {
    display_name:                c.display_name ?? "",
    description:                 c.description ?? "",
    persona_label:               c.persona_label ?? "",
    intercom_admin_id:           c.intercom_admin_id ?? "",
    policy_set_key:              c.policy_set_key ?? "",
    skill_profile_key:           c.skill_profile_key ?? "",
    source_priority_profile_key: c.source_priority_profile_key ?? "",
    notes:                       c.notes ?? "",
    is_test_only:                c.is_test_only ?? false,
    is_main:                     c.is_main ?? false,
  };
}

function getStatusBadge(c: Concierge): { variant: "success" | "warning" | "muted"; label: string } {
  if (!c.is_active) return { variant: "muted", label: "inactive" };
  if (c.is_test_only) return { variant: "warning", label: "test only" };
  return { variant: "success", label: "active" };
}

function ConciergeForm({
  form, onChange, onSubmit, onCancel, saving, error, submitLabel,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const f = form;
  const set = (patch: Partial<FormState>) => onChange({ ...f, ...patch });
  const input = "w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300";
  const monoInput = input + " font-mono";

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">表示名 *</label>
          <input value={f.display_name} onChange={e => set({ display_name: e.target.value })}
            placeholder="例: Ptengine サポート" className={input} />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Intercom Admin ID</label>
          <input value={f.intercom_admin_id} onChange={e => set({ intercom_admin_id: e.target.value })}
            placeholder="例: 7654321" className={monoInput} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">ペルソナラベル</label>
        <input value={f.persona_label} onChange={e => set({ persona_label: e.target.value })}
          placeholder="例: 丁寧・保守的" className={input} />
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">説明</label>
        <textarea value={f.description} onChange={e => set({ description: e.target.value })}
          rows={2} placeholder="このコンシェルジュの用途・特徴"
          className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Policy Set Key</label>
          <input value={f.policy_set_key} onChange={e => set({ policy_set_key: e.target.value })}
            placeholder="例: default" className={monoInput} />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Skill Profile Key</label>
          <input value={f.skill_profile_key} onChange={e => set({ skill_profile_key: e.target.value })}
            placeholder="例: default" className={monoInput} />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Source Priority Key</label>
          <input value={f.source_priority_profile_key} onChange={e => set({ source_priority_profile_key: e.target.value })}
            placeholder="例: default" className={monoInput} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">メモ（任意）</label>
        <input value={f.notes} onChange={e => set({ notes: e.target.value })}
          placeholder="内部メモ" className={input} />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={f.is_test_only} onChange={e => set({ is_test_only: e.target.checked })}
            className="rounded border-[var(--border)]" />
          テスト専用
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={f.is_main} onChange={e => set({ is_main: e.target.checked })}
            className="rounded border-[var(--border)]" />
          メイン（デフォルト）
        </label>
      </div>
      {error && (
        <div className="p-2.5 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">{error}</div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={saving || !f.display_name}>
          {saving ? "保存中…" : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>キャンセル</Button>
      </div>
    </div>
  );
}

export default function ConciergePage() {
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editId, setEditId]           = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [noTable, setNoTable]         = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

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

  const startEdit = (c: Concierge) => {
    setShowAddForm(false);
    setEditId(c.Id);
    setForm(conciergeToForm(c));
    setSaveError(null);
  };

  const cancelEdit = () => { setEditId(null); setSaveError(null); };

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
          is_active: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ?? `保存失敗 (HTTP ${res.status})`);
        return;
      }
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setSaveError(`ネットワークエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form.display_name || editId == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/concierges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: editId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ?? `保存失敗 (HTTP ${res.status})`);
        return;
      }
      setEditId(null);
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
          <Button size="sm" onClick={() => { setShowAddForm(f => !f); setEditId(null); setSaveError(null); setForm(EMPTY_FORM); }}>
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

      {showAddForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle>新しいコンシェルジュを追加</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ConciergeForm
              form={form} onChange={setForm}
              onSubmit={add} onCancel={() => { setShowAddForm(false); setSaveError(null); }}
              saving={saving} error={saveError} submitLabel="追加する"
            />
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
              const isEditing = editId === c.Id;
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
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">{c.concierge_key}</span>
                        </div>
                        {!isEditing && (
                          <>
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
                          </>
                        )}
                        {isEditing && (
                          <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                            <ConciergeForm
                              form={form} onChange={setForm}
                              onSubmit={save} onCancel={cancelEdit}
                              saving={saving} error={saveError} submitLabel="保存する"
                            />
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                            <Pencil size={13} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                            {c.is_active ? "無効化" : "有効化"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(c.Id)}>
                            <Trash2 size={13} className="text-red-500" />
                          </Button>
                        </div>
                      )}
                      {isEditing && (
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          <X size={13} />
                        </Button>
                      )}
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
            <strong className="text-amber-700 ml-1">「メイン」にチェックした concierge が、target に concierge_key が未設定の場合の fallback になります。</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
