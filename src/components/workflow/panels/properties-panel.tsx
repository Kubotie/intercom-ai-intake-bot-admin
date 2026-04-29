"use client";
import type { WorkflowNode } from "@/lib/workflow-types";
import type { ConciergeNodeData, TestTargetNodeData, IntentNodeData, HandoffCheckNodeData, SkillNodeData, TerminalNodeData } from "@/lib/workflow-types";
import type { WorkflowEditorConfig, HandoffPreset } from "@/lib/workflow-editor-types";
import { ConciergePanel }    from "./concierge-panel";
import { TestTargetPanel }   from "./test-target-panel";
import { IntentPanel }       from "./intent-panel";
import type { ClassifyConfig } from "./intent-panel";
import { HandoffCheckPanel } from "./handoff-check-panel";
import { SkillPanel }        from "./skill-panel";
import { TerminalPanel }     from "./terminal-panel";

interface Props {
  node: WorkflowNode | null;
  conciergeKeys: string[];
  onClose: () => void;
  onSaved: () => void;
  onSaveIntentDesc?: (nodeId: string, naturalLanguageDesc: string) => void;
  onSaveIntentNLInstruction?: (nodeId: string, category: string, nlInstruction: string) => void;
  onSaveIntentClassifyConfig?: (nodeId: string, category: string, config: ClassifyConfig) => void;
  editorConfig?: WorkflowEditorConfig;
  onSkillThresholdChange?: (category: string, skillName: string, threshold: number) => void;
  onHandoffPresetChange?: (category: string, preset: HandoffPreset) => void;
  onOpenPolicyEditor?: () => void;
}

export function PropertiesPanel({
  node, conciergeKeys, onClose, onSaved,
  onSaveIntentDesc, onSaveIntentNLInstruction, onSaveIntentClassifyConfig, editorConfig,
  onSkillThresholdChange, onHandoffPresetChange, onOpenPolicyEditor,
}: Props) {
  if (!node) return null;

  const getEffectiveThreshold = (category: string, skillName: string, defaultThreshold: number) => {
    const config = editorConfig?.intentsConfig.intents[category];
    if (config) {
      const skill = config.skills.find(s => s.name === skillName);
      if (skill) return skill.threshold;
    }
    return defaultThreshold;
  };

  const getEffectivePreset = (category: string): HandoffPreset => {
    return editorConfig?.intentsConfig.intents[category]?.handoff.preset ?? "balanced";
  };

  return (
    <div className="absolute top-0 right-0 h-full w-[280px] bg-white border-l border-zinc-200 shadow-lg z-10 overflow-y-auto">
      {node.type === "concierge" && (
        <ConciergePanel
          data={node.data as ConciergeNodeData}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      {node.type === "testTarget" && (
        <TestTargetPanel
          data={node.data as TestTargetNodeData}
          conciergeKeys={conciergeKeys}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      {node.type === "intent" && (() => {
        const intentData = node.data as IntentNodeData;
        const intentCfg = editorConfig?.intentsConfig.intents[intentData.category];
        return (
          <IntentPanel
            data={intentData}
            nlInstruction={intentCfg?.nlInstruction}
            classifyConfig={{
              classifyDescription: intentCfg?.classifyDescription,
              classifyExamples: intentCfg?.classifyExamples,
              classifyPriority: intentCfg?.classifyPriority,
              classifyBoundaryNotes: intentCfg?.classifyBoundaryNotes,
            }}
            allIntentConfigs={editorConfig?.intentsConfig.intents}
            onClose={onClose}
            onSave={onSaveIntentDesc ? (desc) => onSaveIntentDesc(node.id, desc) : undefined}
            onSaveNLInstruction={onSaveIntentNLInstruction
              ? (nl) => onSaveIntentNLInstruction(node.id, intentData.category, nl)
              : undefined}
            onSaveClassifyConfig={onSaveIntentClassifyConfig
              ? (cfg) => onSaveIntentClassifyConfig(node.id, intentData.category, cfg)
              : undefined}
          />
        );
      })()}
      {node.type === "handoffCheck" && (
        <HandoffCheckPanel
          data={node.data as HandoffCheckNodeData}
          onClose={onClose}
          effectivePreset={getEffectivePreset((node.data as HandoffCheckNodeData).category)}
          onPresetChange={onHandoffPresetChange
            ? (preset) => onHandoffPresetChange((node.data as HandoffCheckNodeData).category, preset)
            : undefined}
        />
      )}
      {node.type === "skill" && (
        <SkillPanel
          data={node.data as SkillNodeData}
          onClose={onClose}
          effectiveThreshold={getEffectiveThreshold(
            (node.data as SkillNodeData).category,
            (node.data as SkillNodeData).skillName,
            (node.data as SkillNodeData).confidenceThreshold,
          )}
          onThresholdChange={onSkillThresholdChange
            ? (t) => onSkillThresholdChange(
                (node.data as SkillNodeData).category,
                (node.data as SkillNodeData).skillName,
                t,
              )
            : undefined}
        />
      )}
      {node.type === "terminal" && (
        <TerminalPanel
          data={node.data as TerminalNodeData}
          onClose={onClose}
          policyConfig={editorConfig?.policyConfig}
          onOpenPolicyEditor={onOpenPolicyEditor}
        />
      )}
      {node.type === "entry" && (
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-800 text-sm">エントリポイント</h3>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Intercom から Webhook を受信した時点でフローが開始されます。
            TestTarget ノードでルーティングされたコンシェルジュがここから処理を引き継ぎます。
          </p>
        </div>
      )}
    </div>
  );
}
