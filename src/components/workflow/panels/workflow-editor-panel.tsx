"use client";
import { useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import type { WorkflowDefinition } from "@/lib/nocodb";
import type { WorkflowEditorConfig } from "@/lib/workflow-editor-types";
import { SkillOrderEditor }    from "@/components/workflow/editors/skill-order-editor";
import { HandoffConfigEditor } from "@/components/workflow/editors/handoff-config-editor";
import { PolicyConfigEditor }  from "@/components/workflow/editors/policy-config-editor";
import { SourceConfigEditor }  from "@/components/workflow/editors/source-config-editor";
import { IntentConfigEditor }  from "@/components/workflow/editors/intent-config-editor";

type EditorTab = "intents" | "skill" | "handoff" | "policy" | "source";

interface Props {
  workflow:     WorkflowDefinition;
  config:       WorkflowEditorConfig;
  isDirty:      boolean;
  isSaving:     boolean;
  onChange:     (config: WorkflowEditorConfig) => void;
  onSave:       () => void;
  onClose:      () => void;
  initialTab?:  EditorTab;
}

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-blue-50 text-blue-700 border-blue-200",
  active:   "bg-green-50 text-green-700 border-green-200",
  paused:   "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const TABS: { key: EditorTab; label: string }[] = [
  { key: "intents", label: "インテント" },
  { key: "skill",   label: "スキル順序" },
  { key: "handoff", label: "Handoff" },
  { key: "policy",  label: "ポリシー" },
  { key: "source",  label: "ソース" },
];

export function WorkflowEditorPanel({ workflow, config, isDirty, isSaving, onChange, onSave, onClose, initialTab }: Props) {
  const [tab, setTab] = useState<EditorTab>(initialTab ?? "intents");

  const isArchived = workflow.status === "archived";
  const isActive   = workflow.status === "active";

  return (
    <div className="absolute top-0 right-0 h-full w-[380px] bg-white border-l border-zinc-200 shadow-lg z-10 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold text-zinc-800">Workflow Editor</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 truncate flex-1">{workflow.display_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_BADGE[workflow.status] ?? STATUS_BADGE.draft}`}>
            {workflow.status}
          </span>
          {isDirty && (
            <span className="text-[10px] text-amber-600 font-medium shrink-0">● 未保存</span>
          )}
        </div>
      </div>

      {/* Warnings */}
      {isArchived && (
        <div className="mx-3 mt-2 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-md shrink-0">
          <p className="text-[11px] text-zinc-500">アーカイブ済みワークフローは編集できません。</p>
        </div>
      )}
      {isActive && !isArchived && (
        <div className="mx-3 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md flex gap-2 shrink-0">
          <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-snug">
            本番ワークフローを直接編集中です。安全に試すには draft 複製を推奨します。
          </p>
        </div>
      )}

      {/* Tabs */}
      {!isArchived && (
        <div className="flex gap-px px-2 pt-2 shrink-0 border-b border-zinc-100">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 text-[11px] rounded-t transition-colors ${
                tab === t.key
                  ? "bg-white text-zinc-800 font-medium border-t border-x border-zinc-200 -mb-px"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor content */}
      {!isArchived && (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {tab === "intents" && (
            <IntentConfigEditor
              config={config.intentsConfig}
              onChange={intentsConfig => onChange({ ...config, intentsConfig })}
            />
          )}
          {tab === "skill" && (
            <SkillOrderEditor
              config={config.skillConfig}
              onChange={skillConfig => onChange({ ...config, skillConfig })}
            />
          )}
          {tab === "handoff" && (
            <HandoffConfigEditor
              config={config.handoffConfig}
              onChange={handoffConfig => onChange({ ...config, handoffConfig })}
            />
          )}
          {tab === "policy" && (
            <PolicyConfigEditor
              config={config.policyConfig}
              onChange={policyConfig => onChange({ ...config, policyConfig })}
            />
          )}
          {tab === "source" && (
            <SourceConfigEditor
              config={config.sourceConfig}
              onChange={sourceConfig => onChange({ ...config, sourceConfig })}
            />
          )}
        </div>
      )}
      {isArchived && <div className="flex-1" />}

      {/* Save footer */}
      <div className="border-t border-zinc-100 px-3 py-3 shrink-0">
        <button
          onClick={onSave}
          disabled={isArchived || !isDirty || isSaving}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-zinc-800 text-white rounded-md hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Save size={14} />
          <span>{isSaving ? "保存中..." : isDirty ? "変更を保存" : "変更なし"}</span>
        </button>
        {isDirty && !isSaving && (
          <p className="text-[10px] text-zinc-400 text-center mt-1.5">
            workflow_key: <code>{workflow.workflow_key}</code> に保存されます
          </p>
        )}
      </div>
    </div>
  );
}
