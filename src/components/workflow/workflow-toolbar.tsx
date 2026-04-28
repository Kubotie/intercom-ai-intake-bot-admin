"use client";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Concierge, WorkflowDefinition } from "@/lib/nocodb";

const STATUS_STYLE: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  draft:    "bg-blue-100 text-blue-700",
  paused:   "bg-amber-100 text-amber-700",
  archived: "bg-zinc-100 text-zinc-500",
};

interface Props {
  concierges:          Concierge[];
  filterKey:           string | null;
  onFilterChange:      (key: string | null) => void;
  onResetLayout:       () => void;
  onFitView:           () => void;
  onToggleTestPanel:   () => void;
  testPanelOpen:       boolean;
  hasHighlight:        boolean;
  onClearHighlight:    () => void;
  workflows:           WorkflowDefinition[];
  selectedWorkflowKey: string | null;
  onWorkflowChange:    (key: string | null) => void;
  editMode:            boolean;
  onToggleEditMode:    () => void;
  isDirty:             boolean;
  canEdit:             boolean;
}

export function WorkflowToolbar({
  concierges,
  filterKey,
  onFilterChange,
  onResetLayout,
  onFitView,
  onToggleTestPanel,
  testPanelOpen,
  hasHighlight,
  onClearHighlight,
  workflows,
  selectedWorkflowKey,
  onWorkflowChange,
  editMode,
  onToggleEditMode,
  isDirty,
  canEdit,
}: Props) {
  const activeWorkflows   = workflows.filter(w => w.status !== "archived");
  const selectedWorkflow  = workflows.find(w => w.workflow_key === selectedWorkflowKey) ?? null;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white border border-zinc-200 rounded-lg shadow-sm px-3 py-2">
      {/* Workflow selector */}
      {activeWorkflows.length > 0 && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Workflow</span>
            <select
              value={selectedWorkflowKey ?? ""}
              onChange={e => onWorkflowChange(e.target.value || null)}
              className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[160px]"
            >
              <option value="">すべて</option>
              {activeWorkflows.map(w => (
                <option key={w.Id} value={w.workflow_key}>{w.display_name}</option>
              ))}
            </select>
            {selectedWorkflow && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[selectedWorkflow.status] ?? ""}`}>
                {selectedWorkflow.status}
              </span>
            )}
            <Link href="/workflows" className="text-[10px] text-zinc-400 hover:text-zinc-600 underline underline-offset-2 shrink-0">管理</Link>
          </div>
          <div className="h-4 w-px bg-zinc-200" />
        </>
      )}

      {/* Concierge filter */}
      {concierges.length > 0 && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">コンシェルジュ</span>
            <select
              value={filterKey ?? ""}
              onChange={e => onFilterChange(e.target.value || null)}
              className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">すべて</option>
              {concierges.map(c => (
                <option key={c.Id} value={c.concierge_key}>{c.display_name}</option>
              ))}
            </select>
          </div>
          <div className="h-4 w-px bg-zinc-200" />
        </>
      )}

      {/* Layout controls */}
      <button
        onClick={onResetLayout}
        className="text-xs text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded hover:bg-zinc-100"
      >
        レイアウトリセット
      </button>
      <button
        onClick={onFitView}
        className="text-xs text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded hover:bg-zinc-100"
      >
        全体表示
      </button>

      {/* Highlight clear */}
      {hasHighlight && (
        <>
          <div className="h-4 w-px bg-zinc-200" />
          <button
            onClick={onClearHighlight}
            className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1 rounded hover:bg-amber-50 flex items-center gap-1"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            ハイライトクリア
          </button>
        </>
      )}

      <div className="h-4 w-px bg-zinc-200" />

      {/* Workflow edit toggle */}
      {canEdit && (
        <>
          <button
            onClick={onToggleEditMode}
            className={`text-xs font-medium px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
              editMode
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <Pencil size={11} />
            <span>{editMode ? (isDirty ? "編集中 ●" : "編集中") : "編集"}</span>
          </button>
          <div className="h-4 w-px bg-zinc-200" />
        </>
      )}

      {/* Test run toggle */}
      <button
        onClick={onToggleTestPanel}
        className={`text-xs font-medium px-2.5 py-1 rounded transition-colors ${
          testPanelOpen
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
        }`}
      >
        テスト実行
      </button>
    </div>
  );
}
