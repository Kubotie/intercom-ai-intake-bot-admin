"use client";
import "@xyflow/react/dist/style.css";
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
  addEdge,
  type NodeTypes,
  type Connection,
} from "@xyflow/react";
import type { Concierge, TestTarget, WorkflowDefinition } from "@/lib/nocodb";
import { buildInitialLayout }  from "@/lib/workflow-layout";
import type { WorkflowNode, WorkflowEdge } from "@/lib/workflow-types";
import type { WorkflowRunResult } from "@/lib/workflow-run-result";
import {
  parseEditorConfig,
  DEFAULT_SKILL_CONFIG,
  DEFAULT_HANDOFF_CONFIG,
  DEFAULT_POLICY_CONFIG,
  DEFAULT_SOURCE_CONFIG,
  DEFAULT_INTENTS_CONFIG,
  type WorkflowEditorConfig,
  type HandoffPreset,
} from "@/lib/workflow-editor-types";
import { computeHighlights, applyNodeHighlights, applyEdgeHighlights } from "@/lib/workflow-highlight";
import { EntryNode }                   from "@/components/workflow/nodes/entry-node";
import { TestTargetNode }              from "@/components/workflow/nodes/test-target-node";
import { ConciergeNode }              from "@/components/workflow/nodes/concierge-node";
import { IntentNode }                 from "@/components/workflow/nodes/intent-node";
import { SkillNode }                  from "@/components/workflow/nodes/skill-node";
import { HandoffCheckNode }           from "@/components/workflow/nodes/handoff-check-node";
import { TerminalNode }               from "@/components/workflow/nodes/terminal-node";
import { PropertiesPanel }            from "@/components/workflow/panels/properties-panel";
import { TestRunPanel }               from "@/components/workflow/panels/test-run-panel";
import { WorkflowEditorPanel }        from "@/components/workflow/panels/workflow-editor-panel";
import { WorkflowToolbar }            from "@/components/workflow/workflow-toolbar";

const STORAGE_KEY = "workflow_node_positions_v1";

const NODE_TYPES: NodeTypes = {
  entry:                   EntryNode                  as NodeTypes[string],
  testTarget:              TestTargetNode             as NodeTypes[string],
  concierge:               ConciergeNode              as NodeTypes[string],
  intent:                  IntentNode                 as NodeTypes[string],
  skill:                   SkillNode                  as NodeTypes[string],
  handoffCheck:            HandoffCheckNode           as NodeTypes[string],
  terminal:                TerminalNode               as NodeTypes[string],
};

interface Props {
  concierges:         Concierge[];
  testTargets:        TestTarget[];
  workflows:          WorkflowDefinition[];
  initialWorkflowKey?: string;
}

// ── Inner canvas (inside ReactFlowProvider + Suspense) ────────────────────────

function Canvas({ concierges, testTargets, workflows, initialWorkflowKey }: Props) {
  const { fitView }      = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const searchParams     = useSearchParams();
  const urlWorkflowKey = searchParams.get("workflow_key");
  const urlEditMode    = searchParams.get("edit") === "1";

  // buildLayout は useMemo より前に宣言されるため、editorConfig (useState) を直接参照できない。
  // マウント時の intentsConfig を先に計算し、buildLayout クロージャに渡す。
  const _initialWf = workflows.find(
    w => w.workflow_key === (urlWorkflowKey ?? initialWorkflowKey ?? workflows.find(w2 => w2.status === "active")?.workflow_key)
  );
  const _initialIntentsConfig = _initialWf
    ? parseEditorConfig(_initialWf).intentsConfig
    : { ...DEFAULT_INTENTS_CONFIG };

  const buildLayout = useCallback(
    () => buildInitialLayout(concierges, testTargets, _initialIntentsConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []  // マウント時の intentsConfig（保存済み設定）でレイアウトを確定
  );

  // Restore saved node positions from localStorage
  const getInitialState = useCallback(() => {
    const { nodes, edges } = buildLayout();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const positions: Record<string, { x: number; y: number }> = JSON.parse(saved);
        return {
          nodes: nodes.map((n) =>
            positions[n.id] ? { ...n, position: positions[n.id] } : n
          ) as WorkflowNode[],
          edges,
        };
      }
    } catch { /* ignore */ }
    return { nodes, edges };
  }, [buildLayout]);

  const { nodes: initNodes, edges: initEdges } = useMemo(getInitialState, [getInitialState]);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>(initEdges);

  const [selectedNode,           setSelectedNode]           = useState<WorkflowNode | null>(null);
  const [filterKey,              setFilterKey]              = useState<string | null>(null);
  const [runResult,              setRunResult]              = useState<WorkflowRunResult | null>(null);
  const [testPanelOpen,          setTestPanelOpen]          = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfInstanceRef = useRef<any>(null);

  const [editMode,         setEditMode]         = useState(urlEditMode);
  const [editorInitialTab, setEditorInitialTab] = useState<"intents" | "behavior" | "tools" | "source">("intents");

  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState<string | null>(
    () => urlWorkflowKey ?? initialWorkflowKey ?? workflows.find(w => w.status === "active")?.workflow_key ?? null
  );

  const selectedWorkflow = useMemo(
    () => workflows.find(w => w.workflow_key === selectedWorkflowKey) ?? null,
    [workflows, selectedWorkflowKey]
  );

  // ── Editor config ────────────────────────────────────────────────────────────

  const [editorConfig, setEditorConfig] = useState<WorkflowEditorConfig>(() => {
    const wf = workflows.find(w => w.workflow_key === (urlWorkflowKey ?? initialWorkflowKey ?? workflows.find(w2 => w2.status === "active")?.workflow_key));
    return wf ? parseEditorConfig(wf) : {
      skillConfig:   { ...DEFAULT_SKILL_CONFIG },
      handoffConfig: { ...DEFAULT_HANDOFF_CONFIG },
      policyConfig:  { ...DEFAULT_POLICY_CONFIG },
      sourceConfig:  { ...DEFAULT_SOURCE_CONFIG },
      intentsConfig: { ...DEFAULT_INTENTS_CONFIG },
    };
  });

  const [isDirty,  setIsDirty]  = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // カテゴリ構造の安定ハッシュ（追加/削除/有効化/スキル変更でのみ変化）
  const categoryStructureKey = useMemo(() => {
    return Object.entries(editorConfig.intentsConfig.intents)
      .filter(([, v]) => v?.enabled !== false)
      .map(([k, v]) => `${k}:${(v.skills ?? []).map(s => s.name).sort().join("|")}`)
      .sort()
      .join(",");
  }, [editorConfig.intentsConfig]);

  const isFirstStructureRun = useRef(true);

  useEffect(() => {
    if (selectedWorkflow) {
      setEditorConfig(parseEditorConfig(selectedWorkflow));
      setIsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowKey]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // カテゴリ構造（追加/削除/有効化/スキル変更）が変わったときにキャンバスを再構築
  useEffect(() => {
    if (isFirstStructureRun.current) { isFirstStructureRun.current = false; return; }
    const { nodes: freshNodes, edges: freshEdges } = buildInitialLayout(
      concierges, testTargets, editorConfig.intentsConfig
    );
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const positions = JSON.parse(saved) as Record<string, { x: number; y: number }>;
        setNodes(freshNodes.map(n => positions[n.id] ? { ...n, position: positions[n.id] } : n) as WorkflowNode[]);
      } else {
        setNodes(freshNodes as WorkflowNode[]);
      }
    } catch {
      setNodes(freshNodes as WorkflowNode[]);
    }
    setEdges(freshEdges as WorkflowEdge[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryStructureKey]);

  // ── Persist positions ─────────────────────────────────────────────────────────

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistPositions = useCallback((updated: WorkflowNode[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const map: Record<string, { x: number; y: number }> = {};
      updated.forEach((n) => { map[n.id] = n.position; });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
    }, 400);
  }, []);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  // Persist positions separately to avoid double-setNodes resetting the viewport
  useEffect(() => {
    persistPositions(nodes as WorkflowNode[]);
  }, [nodes, persistPositions]);

  // ── Node click ────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    if (editMode) return; // ignore node clicks in edit mode
    setTestPanelOpen(false);
    setSelectedNode((prev) => (prev?.id === node.id ? null : node as WorkflowNode));
  }, [editMode]);

  // ── Reset layout ──────────────────────────────────────────────────────────────

  const handleResetLayout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    const { nodes: fresh } = buildLayout();
    setNodes(fresh as WorkflowNode[]);
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 50);
  }, [buildLayout, setNodes, fitView]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.1, duration: 400 });
  }, [fitView]);

  // fitView after nodes are measured (reliable with dynamic import + Suspense)
  const didFitRef = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !didFitRef.current) {
      didFitRef.current = true;
      fitView({ padding: 0.15 });
    }
  }, [nodesInitialized, fitView]);

  // ── Test panel ────────────────────────────────────────────────────────────────

  const handleToggleTestPanel = useCallback(() => {
    setTestPanelOpen((prev) => {
      if (!prev) { setSelectedNode(null); setEditMode(false); }
      return !prev;
    });
  }, []);

  const handleTestResult = useCallback((result: WorkflowRunResult | null) => {
    setRunResult(result);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setRunResult(null);
  }, []);

  // ── Edit mode ─────────────────────────────────────────────────────────────────

  const handleToggleEditMode = useCallback(() => {
    setEditMode(prev => {
      if (!prev) {
        setTestPanelOpen(false);
        setSelectedNode(null);
      }
      return !prev;
    });
  }, []);

  const handleEditorChange = useCallback((config: WorkflowEditorConfig) => {
    setEditorConfig(config);
    setIsDirty(true);
  }, []);

  const handleSaveWorkflow = useCallback(async () => {
    if (!selectedWorkflow || !isDirty) return;
    setIsSaving(true);

    const changedSections: string[] = [];
    if (Object.keys(editorConfig.skillConfig.category_skill_order).length > 0) changedSections.push("skill");
    if (Object.keys(editorConfig.handoffConfig.category_presets).length > 0 ||
        editorConfig.handoffConfig.global_preset !== "balanced") changedSections.push("handoff");
    if (editorConfig.policyConfig.escalation_keywords.length > 0 ||
        editorConfig.policyConfig.handoff_eagerness !== "normal") changedSections.push("policy");
    if (Object.keys(editorConfig.intentsConfig.intents).length > 0) changedSections.push("intents");

    console.log("[workflow-editor] save started", {
      workflow_key:     selectedWorkflow.workflow_key,
      changed_sections: changedSections,
    });

    try {
      const res = await fetch("/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id:                  selectedWorkflow.Id,
          skill_config_json:   JSON.stringify(editorConfig.skillConfig),
          handoff_config_json: JSON.stringify(editorConfig.handoffConfig),
          policy_config_json:  JSON.stringify(editorConfig.policyConfig),
          source_config_json:  JSON.stringify(editorConfig.sourceConfig),
          intents_config_json: JSON.stringify(editorConfig.intentsConfig),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIsDirty(false);
      console.log("[workflow-editor] save finished", {
        workflow_key:     selectedWorkflow.workflow_key,
        changed_sections: changedSections,
      });
    } catch (e) {
      console.error("[workflow-editor] save failed", {
        error:        String(e),
        workflow_key: selectedWorkflow.workflow_key,
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedWorkflow, isDirty, editorConfig]);

  // ── After save → reload ───────────────────────────────────────────────────────

  const handleSaved = useCallback(() => {
    setSelectedNode(null);
    window.location.reload();
  }, []);

  // ── Node click ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClickExtended = useCallback((_: React.MouseEvent, node: any) => {
    if (editMode) return;
    if (node.type === "sectionHeader") return;
    setTestPanelOpen(false);
    setSelectedNode(prev => prev?.id === node.id ? null : node as WorkflowNode);
  }, [editMode]);

  // ── Connect edges ─────────────────────────────────────────────────────────────

  const handleConnect = useCallback((connection: Connection) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEdges((eds: any[]) => addEdge(
      { ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}` },
      eds
    ));
  }, [setEdges]);

  const handleIntentDescSave = useCallback((nodeId: string, naturalLanguageDesc: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNodes((nds: any[]) => nds.map((n: any) =>
      n.id === nodeId ? { ...n, data: { ...n.data, naturalLanguageDesc } } : n
    ));
  }, [setNodes]);

  const handleIntentNLInstructionSave = useCallback((_nodeId: string, category: string, nlInstruction: string) => {
    setEditorConfig(prev => {
      const existing = prev.intentsConfig.intents[category] ?? {
        enabled: true,
        slots: { required: [], optional: [], priority: [] },
        handoff: { preset: "balanced" as HandoffPreset, required: [], any_of: [] },
        skills: [],
      };
      return {
        ...prev,
        intentsConfig: {
          ...prev.intentsConfig,
          intents: {
            ...prev.intentsConfig.intents,
            [category]: { ...existing, nlInstruction },
          },
        },
      };
    });
    setIsDirty(true);
  }, [setEditorConfig, setIsDirty]);

  const handleIntentClassifyConfigSave = useCallback((_nodeId: string, category: string, cfg: { classifyDescription: string; classifyExamples: string[]; classifyPriority: number; classifyBoundaryNotes: string }) => {
    setEditorConfig(prev => {
      const existing = prev.intentsConfig.intents[category] ?? {
        enabled: true,
        slots: { required: [], optional: [], priority: [] },
        handoff: { preset: "balanced" as HandoffPreset, required: [], any_of: [] },
        skills: [],
      };
      return {
        ...prev,
        intentsConfig: {
          ...prev.intentsConfig,
          intents: {
            ...prev.intentsConfig.intents,
            [category]: {
              ...existing,
              classifyDescription: cfg.classifyDescription,
              classifyExamples: cfg.classifyExamples,
              classifyPriority: cfg.classifyPriority,
              classifyBoundaryNotes: cfg.classifyBoundaryNotes,
            },
          },
        },
      };
    });
    setIsDirty(true);
  }, [setEditorConfig, setIsDirty]);

  const handleSkillThresholdChange = useCallback((category: string, skillName: string, threshold: number) => {
    setEditorConfig(prev => {
      const intents = { ...prev.intentsConfig.intents };
      const existing = intents[category] ?? { enabled: true, slots: { required: [], optional: [], priority: [] }, handoff: { preset: "balanced" as HandoffPreset, required: [], any_of: [] }, skills: [] };
      const skills = [...(existing.skills ?? [])];
      const idx = skills.findIndex(s => s.name === skillName);
      if (idx >= 0) skills[idx] = { ...skills[idx], threshold };
      else skills.push({ name: skillName, threshold });
      intents[category] = { ...existing, skills };
      return { ...prev, intentsConfig: { ...prev.intentsConfig, intents } };
    });
    setIsDirty(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNodes((nds: any[]) => nds.map((n: any) =>
      n.type === "skill" && n.data.category === category && n.data.skillName === skillName
        ? { ...n, data: { ...n.data, confidenceThreshold: threshold } }
        : n
    ));
  }, [setEditorConfig, setIsDirty, setNodes]);

  const handleHandoffPresetChange = useCallback((category: string, preset: HandoffPreset) => {
    setEditorConfig(prev => {
      const intents = { ...prev.intentsConfig.intents };
      const existing = intents[category] ?? { enabled: true, slots: { required: [], optional: [], priority: [] }, handoff: { preset: "balanced" as HandoffPreset, required: [], any_of: [] }, skills: [] };
      intents[category] = { ...existing, handoff: { ...existing.handoff, preset } };
      return { ...prev, intentsConfig: { ...prev.intentsConfig, intents } };
    });
    setIsDirty(true);
  }, [setEditorConfig, setIsDirty]);

  // ── Compute highlight set ─────────────────────────────────────────────────────

  const highlights = useMemo(
    () => (runResult ? computeHighlights(runResult, concierges) : null),
    [runResult, concierges]
  );

  // ── Derived node/edge state (filter + highlight) ──────────────────────────────

  const conciergeKeys = useMemo(
    () => concierges.map((c) => c.concierge_key),
    [concierges]
  );

  const visibleNodes = useMemo(() => {
    let result = nodes as WorkflowNode[];

    if (filterKey) {
      result = result.map((n) => {
        let dimmed = false;
        if (n.type === "concierge") {
          dimmed = (n.data as { conciergeKey: string }).conciergeKey !== filterKey;
        } else if (n.type === "testTarget") {
          dimmed = (n.data as { conciergeKey: string | null }).conciergeKey !== filterKey;
        }
        return dimmed
          ? { ...n, style: { ...n.style, opacity: 0.25 } }
          : { ...n, style: { ...n.style, opacity: 1 } };
      });
    }

    if (highlights) {
      result = applyNodeHighlights(result, highlights);
    }

    return result;
  }, [nodes, filterKey, highlights]);

  const visibleEdges = useMemo(() => {
    if (!highlights) return edges as WorkflowEdge[];
    return applyEdgeHighlights(edges as WorkflowEdge[], highlights);
  }, [edges, highlights]);

  // ── Render ────────────────────────────────────────────────────────────────────


  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onNodeClick={handleNodeClickExtended as any}
        onPaneClick={() => {
          if (!editMode) setSelectedNode(null);
        }}
        onInit={(instance) => { rfInstanceRef.current = instance; }}
        nodeTypes={NODE_TYPES}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#e4e4e7" />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor={(n) => {
            if (n.type === "concierge")             return "#3b82f6";
            if (n.type === "intent")                return "#8b5cf6";
            if (n.type === "skill")                 return "#a855f7";
            if (n.type === "terminal")              return "#22c55e";
            if (n.type === "testTarget")            return "#64748b";
            if (n.type === "decision")              return "#f97316";
            if (n.type === "intentReunderstanding") return "#7c3aed";
            return "transparent";
          }}
          maskColor="rgba(244,244,246,0.7)"
        />
        <Panel position="top-right">
          <div className="bg-white/95 border border-zinc-200 rounded-lg px-3 py-2.5 shadow-sm text-xs space-y-2" style={{ width: 210 }}>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">凡例</p>
            <div className="flex items-start gap-2">
              <span className="text-slate-500 text-sm leading-none mt-0.5">⇄</span>
              <div>
                <p className="font-semibold text-slate-700 text-[11px]">ルーティング設定</p>
                <p className="text-zinc-400 text-[10px] leading-snug">テスト対象・コンシェルジュの接続を設定</p>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-0.5 border-t border-zinc-100">
              <span className="text-zinc-400 text-sm leading-none mt-0.5">↻</span>
              <div>
                <p className="font-semibold text-zinc-500 text-[11px]">処理フロー <span className="font-normal text-zinc-400">（参照用）</span></p>
                <p className="text-zinc-400 text-[10px] leading-snug">自動生成・直接編集不可</p>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>


      <WorkflowToolbar
        concierges={concierges}
        filterKey={filterKey}
        onFilterChange={setFilterKey}
        onResetLayout={handleResetLayout}
        onFitView={handleFitView}
        onToggleTestPanel={handleToggleTestPanel}
        testPanelOpen={testPanelOpen}
        hasHighlight={!!runResult}
        onClearHighlight={handleClearHighlight}
        workflows={workflows}
        selectedWorkflowKey={selectedWorkflowKey}
        onWorkflowChange={setSelectedWorkflowKey}
        editMode={editMode}
        onToggleEditMode={handleToggleEditMode}
        isDirty={isDirty}
        canEdit={!!selectedWorkflow && selectedWorkflow.status !== "archived"}
      />

      {/* Panels — mutually exclusive */}
      {!testPanelOpen && !editMode && (
        <PropertiesPanel
          node={selectedNode}
          conciergeKeys={conciergeKeys}
          onClose={() => setSelectedNode(null)}
          onSaved={handleSaved}
          onSaveIntentDesc={handleIntentDescSave}
          onSaveIntentNLInstruction={selectedWorkflow ? handleIntentNLInstructionSave : undefined}
          onSaveIntentClassifyConfig={selectedWorkflow ? handleIntentClassifyConfigSave : undefined}
          editorConfig={editorConfig}
          onSkillThresholdChange={selectedWorkflow ? handleSkillThresholdChange : undefined}
          onHandoffPresetChange={selectedWorkflow ? handleHandoffPresetChange : undefined}
          onOpenPolicyEditor={selectedWorkflow ? () => {
            setSelectedNode(null);
            setEditorInitialTab("behavior");
            setEditMode(true);
          } : undefined}
        />
      )}

      {testPanelOpen && (
        <TestRunPanel
          concierges={concierges}
          workflowKey={selectedWorkflowKey}
          onResult={handleTestResult}
          onClose={() => setTestPanelOpen(false)}
        />
      )}

      {editMode && selectedWorkflow && (
        <WorkflowEditorPanel
          workflow={selectedWorkflow}
          config={editorConfig}
          isDirty={isDirty}
          isSaving={isSaving}
          onChange={handleEditorChange}
          onSave={handleSaveWorkflow}
          onClose={() => { setEditMode(false); setEditorInitialTab("intents"); }}
          initialTab={editorInitialTab}
          conciergeKeys={conciergeKeys}
        />
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Suspense fallback={null}>
        <Canvas {...props} />
      </Suspense>
    </ReactFlowProvider>
  );
}
