"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Network, Plus, X } from "lucide-react";
type WorkflowStatus = "draft" | "active" | "paused" | "archived";
type WorkflowDefinition = {
  Id: number;
  workflow_key: string;
  display_name: string;
  description: string | null;
  status: WorkflowStatus;
  scope_type: string | null;
  scope_value: string | null;
  root_concierge_key: string | null;
  notes: string | null;
};

const STATUS_BADGE: Record<WorkflowStatus, { label: string; className: string }> = {
  draft:    { label: "draft",    className: "bg-blue-50 text-blue-700 border border-blue-200" },
  active:   { label: "active",   className: "bg-green-50 text-green-700 border border-green-200" },
  paused:   { label: "paused",   className: "bg-amber-50 text-amber-700 border border-amber-200" },
  archived: { label: "archived", className: "bg-zinc-100 text-zinc-500 border border-zinc-200" },
};

const EMPTY_FORM = {
  workflow_key:       "",
  display_name:       "",
  description:        "",
  scope_type:         "global",
  scope_value:        "",
  root_concierge_key: "",
  notes:              "",
};

export default function WorkflowsPage() {
  const [workflows,   setWorkflows]   = useState<WorkflowDefinition[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [editForm,    setEditForm]    = useState<Partial<typeof EMPTY_FORM>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/workflows");
      const data = await res.json();
      setWorkflows(data.list ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.workflow_key || !form.display_name) return;
    setSaving(true);
    try {
      await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_key:       form.workflow_key,
          display_name:       form.display_name,
          description:        form.description       || null,
          scope_type:         form.scope_type        || "global",
          scope_value:        form.scope_value       || null,
          root_concierge_key: form.root_concierge_key || null,
          notes:              form.notes             || null,
          status: "draft",
        }),
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (wf: WorkflowDefinition, newStatus: WorkflowStatus) => {
    if (newStatus === "archived") {
      await fetch("/api/workflows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: wf.Id }),
      });
    } else {
      await fetch("/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: wf.Id, status: newStatus }),
      });
    }
    await load();
  };

  const handleSaveEdit = async (wf: WorkflowDefinition) => {
    setSaving(true);
    try {
      await fetch("/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: wf.Id, ...editForm }),
      });
      setEditId(null);
      setEditForm({});
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-zinc-600" />
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Workflows</h1>
            <p className="text-xs text-[var(--text-muted)]">Bot 処理パイプラインの定義を管理</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-white text-sm rounded-md hover:bg-zinc-700"
        >
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          <span>{showCreate ? "キャンセル" : "新規作成"}</span>
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 border border-zinc-200 rounded-lg p-4 bg-zinc-50">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">新しいワークフロー</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">workflow_key <span className="text-red-400">*</span></label>
              <input
                value={form.workflow_key}
                onChange={e => setForm({ ...form, workflow_key: e.target.value.replace(/\s/g, "_") })}
                placeholder="e.g. default_v2"
                className="w-full h-8 text-sm px-2 rounded border border-zinc-200 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">display_name <span className="text-red-400">*</span></label>
              <input
                value={form.display_name}
                onChange={e => setForm({ ...form, display_name: e.target.value })}
                placeholder="e.g. デフォルトワークフロー v2"
                className="w-full h-8 text-sm px-2 rounded border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">root_concierge_key</label>
              <input
                value={form.root_concierge_key}
                onChange={e => setForm({ ...form, root_concierge_key: e.target.value })}
                placeholder="e.g. main"
                className="w-full h-8 text-sm px-2 rounded border border-zinc-200 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">scope_type</label>
              <select
                value={form.scope_type}
                onChange={e => setForm({ ...form, scope_type: e.target.value })}
                className="w-full h-8 text-sm px-2 rounded border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
              >
                <option value="global">global</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-500 block mb-1">description</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="このワークフローの説明"
                className="w-full h-8 text-sm px-2 rounded border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={handleCreate}
              disabled={saving || !form.workflow_key || !form.display_name}
              className="px-4 py-1.5 text-sm bg-zinc-800 text-white rounded-md hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "作成 (draft)"}
            </button>
          </div>
        </div>
      )}

      {/* Workflow list */}
      {loading ? (
        <p className="text-sm text-zinc-400 text-center py-12">読み込み中...</p>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Network size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">ワークフローがまだありません。</p>
          <p className="text-xs mt-1">「新規作成」ボタンで最初のワークフローを追加してください。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(wf => {
            const badge      = STATUS_BADGE[wf.status] ?? STATUS_BADGE.draft;
            const isEditing  = editId === wf.Id;
            const isArchived = wf.status === "archived";
            return (
              <div
                key={wf.Id}
                className={`border border-zinc-200 rounded-lg bg-white ${isArchived ? "opacity-50" : ""}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                        <code className="text-xs text-zinc-400 font-mono">{wf.workflow_key}</code>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 mt-2">
                          <input
                            value={editForm.display_name ?? wf.display_name}
                            onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
                            className="w-full h-7 text-sm px-2 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                          />
                          <input
                            value={editForm.description ?? (wf.description ?? "")}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="description"
                            className="w-full h-7 text-sm px-2 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                          />
                          <input
                            value={editForm.root_concierge_key ?? (wf.root_concierge_key ?? "")}
                            onChange={e => setEditForm({ ...editForm, root_concierge_key: e.target.value })}
                            placeholder="root_concierge_key"
                            className="w-full h-7 text-sm px-2 rounded border border-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-300"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(wf)}
                              disabled={saving}
                              className="px-3 py-1 text-xs bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => { setEditId(null); setEditForm({}); }}
                              className="px-2 py-1 text-xs border border-zinc-200 rounded hover:bg-zinc-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-zinc-800">{wf.display_name}</p>
                          {wf.description && (
                            <p className="text-xs text-zinc-400 mt-0.5">{wf.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-1.5">
                            {wf.root_concierge_key && (
                              <span className="text-[11px] text-zinc-400 font-mono">
                                root: {wf.root_concierge_key}
                              </span>
                            )}
                            {wf.scope_type && (
                              <span className="text-[11px] text-zinc-400">
                                scope: {wf.scope_type}{wf.scope_value ? `/${wf.scope_value}` : ""}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {wf.status === "draft" && (
                          <button
                            onClick={() => handleStatusChange(wf, "active")}
                            className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                          >
                            有効化
                          </button>
                        )}
                        {wf.status === "active" && (
                          <button
                            onClick={() => handleStatusChange(wf, "paused")}
                            className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100"
                          >
                            一時停止
                          </button>
                        )}
                        {wf.status === "paused" && (
                          <button
                            onClick={() => handleStatusChange(wf, "active")}
                            className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                          >
                            再開
                          </button>
                        )}
                        {!isArchived && (
                          <>
                            <Link
                              href={`/workflows/${wf.workflow_key}`}
                              className="text-xs px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded hover:bg-violet-100"
                            >
                              キャンバスを開く
                            </Link>
                            <button
                              onClick={() => { setEditId(wf.Id); setEditForm({}); }}
                              className="text-xs px-2 py-1 border border-zinc-200 rounded hover:bg-zinc-50 text-zinc-600"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`"${wf.display_name}" をアーカイブしますか？`)) {
                                  handleStatusChange(wf, "archived");
                                }
                              }}
                              className="text-xs px-2 py-1 border border-zinc-200 rounded hover:bg-zinc-50 text-zinc-400"
                            >
                              アーカイブ
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
