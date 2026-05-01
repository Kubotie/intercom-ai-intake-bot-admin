"use client";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { INTENT_META, SORTED_CATEGORIES } from "@/lib/workflow-types";
import { useSkills } from "@/hooks/use-skills";
import type { IntentsConfigJson, IntentCategoryConfig } from "@/lib/workflow-editor-types";

// ── Default intent config for template categories ─────────────────────────────

function makeDefaultConfig(key: string): IntentCategoryConfig {
  return {
    enabled: true,
    label: INTENT_META[key]?.label ?? key,
    slots: { required: [], optional: [], priority: [] },
    handoff: { preset: "balanced", required: [], any_of: [] },
    skills: [],
  };
}

// ── Category row editor ───────────────────────────────────────────────────────

interface CategoryEditorProps {
  category: string;
  intentConfig: IntentCategoryConfig;
  isTemplate: boolean;
  onChange: (category: string, config: IntentCategoryConfig) => void;
  onDelete: (category: string) => void;
  skillLabels: Record<string, string>;
  skillThresholds: Record<string, number>;
  allSkillKeys: string[];
}

function CategoryEditor({ category, intentConfig, isTemplate, onChange, onDelete, skillLabels, skillThresholds, allSkillKeys }: CategoryEditorProps) {
  const [classifyOpen, setClassifyOpen] = useState(false);

  const label = intentConfig.label ?? (INTENT_META[category]?.label ?? category);
  const enabled = intentConfig.enabled ?? true;
  const nlInstruction = intentConfig.nlInstruction ?? "";
  const classifyDescription = intentConfig.classifyDescription ?? "";
  const classifyExamples = intentConfig.classifyExamples ?? [];
  const classifyPriority = intentConfig.classifyPriority ?? 5;
  const classifyBoundaryNotes = intentConfig.classifyBoundaryNotes ?? "";

  const update = (partial: Partial<IntentCategoryConfig>) => {
    onChange(category, { ...intentConfig, ...partial });
  };

  const hasClassifyConfig = !!(intentConfig.classifyDescription || intentConfig.classifyExamples?.length || intentConfig.classifyBoundaryNotes);

  // スキルトグル — 全カテゴリで全スキルを選択可能
  const availableSkills = allSkillKeys;
  // デフォルト: 設定済みスキルがあればそれを使用、なければ INTENT_META のデフォルトスキル
  const metaDefaultSkills = INTENT_META[category]?.skills ?? [];
  const activeSkillNames = new Set(
    (intentConfig.skills ?? []).length > 0
      ? (intentConfig.skills ?? []).map(s => s.name)
      : metaDefaultSkills
  );
  const toggleSkill = (skillName: string, checked: boolean) => {
    const base = (intentConfig.skills ?? []).length > 0
      ? intentConfig.skills
      : metaDefaultSkills.map(name => ({ name, threshold: skillThresholds[name] ?? 0.65 }));
    const newSkills = checked
      ? [...base.filter(s => s.name !== skillName), { name: skillName, threshold: skillThresholds[skillName] ?? 0.65 }]
      : base.filter(s => s.name !== skillName);
    update({ skills: newSkills });
  };

  return (
    <div className="border border-zinc-200 rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-zinc-700 font-mono truncate">{label}</span>
          {!isTemplate && (
            <span className="ml-2 text-[10px] text-zinc-400 font-mono">({category})</span>
          )}
        </div>
        {!isTemplate && (
          <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded-full shrink-0">カスタム</span>
        )}
        <button
          onClick={() => update({ enabled: !enabled })}
          className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${enabled ? "bg-blue-500" : "bg-zinc-200"}`}
          title={enabled ? "無効にする" : "有効にする"}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <button
          onClick={() => onDelete(category)}
          className="text-zinc-300 hover:text-red-400 transition-colors shrink-0"
          title="削除"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {enabled && (
        <div className="px-3 py-3 space-y-3">
          {/* Label (editable for custom categories) */}
          {!isTemplate && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 mb-1">表示名</label>
              <input
                type="text"
                value={label}
                onChange={e => update({ label: e.target.value })}
                className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          )}

          {/* NL Instruction */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">振る舞い指示</label>
            <textarea
              value={nlInstruction}
              onChange={e => update({ nlInstruction: e.target.value })}
              placeholder={`例: ${label}の問い合わせは丁寧に対応し、解決策が見つからない場合は早めに担当者に引き継ぐ`}
              rows={3}
              className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-2 resize-y leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
            />
            {!isTemplate && (
              <p className="text-[10px] text-violet-500 mt-1">カスタムカテゴリは NL 指示で動作します。handoff タイミングも自然言語で記述してください。</p>
            )}
          </div>

          {/* Skill toggles */}
          {availableSkills.length > 0 && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">使用するスキル</label>
              <div className="space-y-1">
                {availableSkills.map(skillName => (
                  <label key={skillName} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeSkillNames.has(skillName)}
                      onChange={e => toggleSkill(skillName, e.target.checked)}
                      className="w-3 h-3 accent-blue-600"
                    />
                    <span className="text-[11px] text-zinc-700">{skillLabels[skillName] ?? skillName}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">
                {isTemplate
                  ? "キャンバスと bot 処理フローに反映されます"
                  : "選択するとキャンバスにスキルノードが追加され、ナレッジベース検索が有効になります"}
              </p>
            </div>
          )}

          {/* Classify config (collapsible) */}
          <div>
            <button
              onClick={() => setClassifyOpen(o => !o)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 w-full text-left"
            >
              {classifyOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="font-medium">分類設定</span>
              {hasClassifyConfig && (
                <span className="ml-auto text-[10px] text-green-600 font-medium">✓ 設定済み</span>
              )}
            </button>

            {classifyOpen && (
              <div className="mt-2 space-y-2.5 pl-3 border-l border-zinc-100">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">カテゴリ説明</label>
                  <textarea
                    value={classifyDescription}
                    onChange={e => update({ classifyDescription: e.target.value })}
                    placeholder="このカテゴリはどんな問い合わせか（LLMが分類に使用します）"
                    rows={2}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-none leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">発話例（1行1例）</label>
                  <textarea
                    value={classifyExamples.join("\n")}
                    onChange={e => update({ classifyExamples: e.target.value.split("\n").filter(Boolean) })}
                    placeholder={`例:\n${label}について教えてほしい\nどうやって使えばいいですか`}
                    rows={3}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-y leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">分類優先度</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={classifyPriority}
                    onChange={e => update({ classifyPriority: Number(e.target.value) })}
                    className="w-16 text-[11px] text-zinc-800 border border-zinc-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                  <span className="text-[10px] text-zinc-400 ml-2">1〜10（大きいほど優先）</span>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">境界判定メモ</label>
                  <textarea
                    value={classifyBoundaryNotes}
                    onChange={e => update({ classifyBoundaryNotes: e.target.value })}
                    placeholder="他カテゴリとの区別・境界ケースの判定方針"
                    rows={2}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-none leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom category add form ───────────────────────────────────────────────────

interface AddCustomFormProps {
  existingKeys: string[];
  onAdd: (key: string, label: string) => void;
  onCancel: () => void;
}

function AddCustomForm({ existingKeys, onAdd, onCancel }: AddCustomFormProps) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { keyRef.current?.focus(); }, []);

  const keyError = key && (!/^[a-z0-9_]+$/.test(key) ? "英小文字・数字・アンダースコアのみ" : existingKeys.includes(key) ? "このキーは既に使われています" : null);
  const canSubmit = key && label && !keyError;

  return (
    <div className="border border-violet-200 bg-violet-50 rounded-md px-3 py-3 space-y-2">
      <p className="text-[11px] font-medium text-violet-700">カスタムカテゴリを追加</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            ref={keyRef}
            type="text"
            value={key}
            onChange={e => setKey(e.target.value.toLowerCase())}
            placeholder="category_key"
            className="w-full text-[11px] font-mono border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
          />
          {keyError && <p className="text-[10px] text-red-500 mt-0.5">{keyError}</p>}
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="表示名"
            className="w-full text-[11px] border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => canSubmit && onAdd(key, label)}
          disabled={!canSubmit}
          className="px-3 py-1 text-[11px] bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          追加
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface Props {
  config: IntentsConfigJson;
  onChange: (config: IntentsConfigJson) => void;
}

export function IntentConfigEditor({ config, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { skills, skillLabels, skillThresholds } = useSkills();
  const allSkillKeys = skills.map(s => s.key);

  // 初回: config.intents が空ならデフォルト7カテゴリを自動追加
  useEffect(() => {
    if (Object.keys(config.intents).length === 0) {
      const defaultIntents = Object.fromEntries(
        SORTED_CATEGORIES.map(key => [key, makeDefaultConfig(key)])
      );
      onChange({ ...config, intents: defaultIntents });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentKeys = Object.keys(config.intents);
  const availableTemplates = SORTED_CATEGORIES.filter(k => !currentKeys.includes(k));
  const configuredCount = currentKeys.filter(k => config.intents[k]?.nlInstruction || config.intents[k]?.classifyDescription).length;

  const handleCategoryChange = (category: string, catConfig: IntentCategoryConfig) => {
    onChange({ ...config, intents: { ...config.intents, [category]: catConfig } });
  };

  const handleDelete = (category: string) => {
    const next = { ...config.intents };
    delete next[category];
    onChange({ ...config, intents: next });
  };

  const addTemplate = (key: string) => {
    onChange({ ...config, intents: { ...config.intents, [key]: makeDefaultConfig(key) } });
    setTemplateDropdownOpen(false);
  };

  const addCustom = (key: string, label: string) => {
    onChange({
      ...config,
      intents: { ...config.intents, [key]: { ...makeDefaultConfig(key), label } },
    });
    setShowCustomForm(false);
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] text-zinc-500 leading-snug flex-1">
          カテゴリごとの振る舞い指示と分類設定を記述します。
        </p>
        {configuredCount > 0 && (
          <span className="text-[10px] text-blue-600 font-medium shrink-0">{configuredCount}件設定済み</span>
        )}
      </div>

      {/* Add buttons */}
      <div className="flex gap-2 mb-3">
        {/* Template dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setTemplateDropdownOpen(o => !o); setShowCustomForm(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-200 transition-colors"
          >
            <Plus size={11} />
            テンプレートから追加
          </button>
          {templateDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-zinc-200 rounded-md shadow-lg z-20 overflow-hidden">
              {availableTemplates.length === 0 ? (
                <p className="text-[11px] text-zinc-400 px-3 py-2">すべてのテンプレートが追加済みです</p>
              ) : (
                availableTemplates.map(key => (
                  <button
                    key={key}
                    onClick={() => addTemplate(key)}
                    className="w-full text-left px-3 py-2 text-[11px] text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    {INTENT_META[key].label}
                    <span className="block text-[10px] text-zinc-400 font-mono">{key}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Custom add */}
        <button
          onClick={() => { setShowCustomForm(o => !o); setTemplateDropdownOpen(false); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-violet-50 hover:bg-violet-100 text-violet-700 rounded border border-violet-200 transition-colors"
        >
          <Plus size={11} />
          カスタムで追加
        </button>
      </div>

      {/* Custom add form */}
      {showCustomForm && (
        <AddCustomForm
          existingKeys={currentKeys}
          onAdd={addCustom}
          onCancel={() => setShowCustomForm(false)}
        />
      )}

      {/* Category list */}
      {currentKeys.length === 0 ? (
        <p className="text-[11px] text-zinc-400 py-4 text-center">カテゴリがありません。上のボタンから追加してください。</p>
      ) : (
        currentKeys.map(category => {
          const isOpen = expanded === category;
          const isTemplate = SORTED_CATEGORIES.includes(category);
          const intentConfig = config.intents[category];
          const hasContent = !!(intentConfig?.nlInstruction || intentConfig?.classifyDescription);
          const isDisabled = intentConfig?.enabled === false;
          return (
            <div key={category}>
              <button
                onClick={() => setExpanded(isOpen ? null : category)}
                className="w-full flex items-center gap-1.5 py-1.5 text-left"
              >
                {isOpen ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-400" />}
                <span className={`text-xs ${isDisabled ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                  {intentConfig?.label ?? INTENT_META[category]?.label ?? category}
                </span>
                {isDisabled && <span className="ml-1 text-[10px] text-zinc-400">無効</span>}
                {!isTemplate && !isDisabled && (
                  <span className="text-[10px] bg-violet-50 text-violet-500 border border-violet-100 px-1 rounded ml-1">カスタム</span>
                )}
                {hasContent && !isDisabled && (
                  <span className="ml-auto text-[10px] text-blue-600 font-medium">✓ 設定済み</span>
                )}
              </button>
              {isOpen && (
                <CategoryEditor
                  category={category}
                  intentConfig={intentConfig}
                  isTemplate={isTemplate}
                  onChange={handleCategoryChange}
                  onDelete={handleDelete}
                  skillLabels={skillLabels}
                  skillThresholds={skillThresholds}
                  allSkillKeys={allSkillKeys}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
