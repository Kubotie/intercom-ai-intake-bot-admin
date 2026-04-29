"use client";
import { useState } from "react";
import type { IntentNodeData } from "@/lib/workflow-types";
import { INTENT_COLOR_CLASSES } from "@/lib/workflow-types";

export type ClassifyConfig = {
  classifyDescription: string;
  classifyExamples: string[];
  classifyPriority: number;
  classifyBoundaryNotes: string;
};

interface Props {
  data: IntentNodeData & { naturalLanguageDesc?: string };
  nlInstruction?: string;
  classifyConfig?: Partial<ClassifyConfig>;
  allIntentConfigs?: Record<string, { classifyPriority?: number }>;
  onClose: () => void;
  onSave?: (naturalLanguageDesc: string) => void;
  onSaveNLInstruction?: (nlInstruction: string) => void;
  onSaveClassifyConfig?: (config: ClassifyConfig) => void;
}

function SectionHeader({
  title,
  isOpen,
  onToggle,
  isSet,
  badgeColor,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  isSet: boolean;
  badgeColor: "emerald" | "amber" | "blue";
}) {
  const badgeClasses = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber:   "bg-amber-100   text-amber-700",
    blue:    "bg-blue-100    text-blue-700",
  }[badgeColor];

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between text-left"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700">
        <span className="text-zinc-400 text-[10px]">{isOpen ? "▼" : "▶"}</span>
        {title}
      </span>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${isSet ? badgeClasses : "bg-zinc-100 text-zinc-400"}`}>
        {isSet ? "✓ 設定済み" : "未設定"}
      </span>
    </button>
  );
}

export function IntentPanel({
  data, nlInstruction, classifyConfig, allIntentConfigs,
  onClose, onSave, onSaveNLInstruction, onSaveClassifyConfig,
}: Props) {
  const colors = INTENT_COLOR_CLASSES[data.meta.color] ?? INTENT_COLOR_CLASSES["blue"];

  // State for fields
  const [desc,             setDesc]             = useState(data.naturalLanguageDesc ?? "");
  const [nlText,           setNlText]           = useState(nlInstruction ?? "");
  const [classifyDesc,     setClassifyDesc]     = useState(classifyConfig?.classifyDescription ?? "");
  const [classifyExamples, setClassifyExamples] = useState<string[]>(classifyConfig?.classifyExamples ?? []);
  const [classifyPriority, setClassifyPriority] = useState(classifyConfig?.classifyPriority ?? 5);
  const [classifyBoundary, setClassifyBoundary] = useState(classifyConfig?.classifyBoundaryNotes ?? "");
  const [exampleInput,     setExampleInput]     = useState("");

  // Accordion open state — green open by default, amber/blue collapsed
  const [nlOpen,       setNlOpen]       = useState(true);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [descOpen,     setDescOpen]     = useState(false);

  // Is each section configured?
  const nlIsSet       = nlText.trim().length > 0;
  const classifyIsSet = classifyDesc.trim().length > 0 || classifyExamples.length > 0;
  const descIsSet     = desc.trim().length > 0;

  // Other intents' priorities for reference (exclude current category)
  const otherPriorities = allIntentConfigs
    ? Object.entries(allIntentConfigs)
        .filter(([cat]) => cat !== data.category && allIntentConfigs[cat]?.classifyPriority !== undefined)
        .sort(([, a], [, b]) => (b.classifyPriority ?? 5) - (a.classifyPriority ?? 5))
    : [];

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${colors.badge} mb-1`}>
            {data.meta.label}
          </span>
          <p className="text-[11px] text-zinc-500">{data.category}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-zinc-600">{data.meta.desc}</p>

      {/* ── 🟢 ボット対応方針（自然言語指示）── */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
        <div className="px-3 py-2">
          <SectionHeader
            title="ボット対応方針（自然言語指示）"
            isOpen={nlOpen}
            onToggle={() => setNlOpen(v => !v)}
            isSet={nlIsSet}
            badgeColor="emerald"
          />
        </div>
        {nlOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-emerald-100">
            <p className="text-[10px] text-emerald-600 leading-relaxed pt-2">
              「どの情報を収集し、いつ担当者に引き継ぐか」を自然言語で記述します。
            </p>
            <textarea
              value={nlText}
              onChange={e => setNlText(e.target.value)}
              rows={6}
              placeholder={`例:\n・収集すべき情報: 症状、プロジェクト名/ID、発生URL、発生日時\n・優先順位: まず症状を確認し、次にプロジェクトID\n・ハンドオフのタイミング: 症状が明確で発生日時またはURLが確認できたら引き継ぐ`}
              className="w-full text-xs px-3 py-2 rounded-lg border border-emerald-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none leading-relaxed font-mono"
            />
            {onSaveNLInstruction ? (
              <button
                onClick={() => onSaveNLInstruction(nlText)}
                className="w-full px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors"
              >
                適用
              </button>
            ) : (
              <p className="text-[10px] text-zinc-400">ワークフローを選択すると編集できます</p>
            )}
          </div>
        )}
      </div>

      {/* ── 🟡 分類設定（インテント判定）── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
        <div className="px-3 py-2">
          <SectionHeader
            title="分類設定（インテント判定）"
            isOpen={classifyOpen}
            onToggle={() => setClassifyOpen(v => !v)}
            isSet={classifyIsSet}
            badgeColor="amber"
          />
        </div>
        {classifyOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-amber-100">
            <p className="text-[10px] text-amber-600 leading-relaxed pt-2">
              最初のメッセージをこのインテントに分類するための定義。静的プロンプトより優先されます。
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-amber-700">説明（どんな問い合わせか）</label>
              <textarea
                value={classifyDesc}
                onChange={e => setClassifyDesc(e.target.value)}
                rows={3}
                placeholder="例: タグ設置・GTM設定・イベント計測・データ欠損など計測そのものの問題。"
                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none leading-relaxed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-amber-700">発話例</label>
              <div className="flex flex-wrap gap-1 mb-1">
                {classifyExamples.map((ex, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    {ex}
                    <button
                      onClick={() => setClassifyExamples(prev => prev.filter((_, j) => j !== i))}
                      className="hover:text-red-500 leading-none"
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={exampleInput}
                  onChange={e => setExampleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && exampleInput.trim()) {
                      setClassifyExamples(prev => [...prev, exampleInput.trim()]);
                      setExampleInput("");
                      e.preventDefault();
                    }
                  }}
                  placeholder="例を入力して Enter"
                  className="flex-1 text-xs px-2 py-1 rounded border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
                <button
                  onClick={() => {
                    if (exampleInput.trim()) {
                      setClassifyExamples(prev => [...prev, exampleInput.trim()]);
                      setExampleInput("");
                    }
                  }}
                  className="px-2 py-1 text-xs bg-amber-200 text-amber-800 rounded hover:bg-amber-300"
                >＋</button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <label className="text-[10px] font-medium text-amber-700 shrink-0">優先度 (1〜10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={classifyPriority}
                  onChange={e => setClassifyPriority(Math.min(10, Math.max(1, Number(e.target.value))))}
                  className="w-16 text-xs px-2 py-1 rounded border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 text-center"
                />
                <span className="text-[10px] text-amber-600">大きいほど先に判定</span>
              </div>
              {otherPriorities.length > 0 && (
                <div className="rounded bg-amber-100/60 px-2 py-1.5">
                  <p className="text-[9px] text-amber-600 font-medium mb-1">他のインテントの優先度（参考）</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {otherPriorities.map(([cat, cfg]) => (
                      <span key={cat} className="text-[9px] text-amber-700">
                        {cat}: <span className="font-semibold">{cfg.classifyPriority}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-amber-700">境界判定メモ（他カテゴリとの区別）</label>
              <textarea
                value={classifyBoundary}
                onChange={e => setClassifyBoundary(e.target.value)}
                rows={2}
                placeholder="例: 体験のCV計測が取れない場合は tracking_issue。ポップアップが起動しない場合は experience_issue を優先。"
                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none leading-relaxed"
              />
            </div>

            {onSaveClassifyConfig ? (
              <button
                onClick={() => onSaveClassifyConfig({ classifyDescription: classifyDesc, classifyExamples, classifyPriority, classifyBoundaryNotes: classifyBoundary })}
                className="w-full px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors"
              >
                適用
              </button>
            ) : (
              <p className="text-[10px] text-zinc-400">ワークフローを選択すると編集できます</p>
            )}
          </div>
        )}
      </div>

      {/* ── 🔵 ノード表示説明 ── */}
      {onSave && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 overflow-hidden">
          <div className="px-3 py-2">
            <SectionHeader
              title="ノード表示説明（カスタマイズ）"
              isOpen={descOpen}
              onToggle={() => setDescOpen(v => !v)}
              isSet={descIsSet}
              badgeColor="blue"
            />
          </div>
          {descOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-blue-100">
              {desc && (
                <p className="text-[11px] text-blue-600 italic border-l-2 border-blue-300 pl-2 pt-2">
                  現在: {desc}
                </p>
              )}
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={3}
                placeholder={data.meta.desc}
                className="w-full text-xs px-3 py-2 rounded-lg border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-zinc-400">空にするとデフォルト説明を使用</p>
                <button
                  onClick={() => onSave(desc)}
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 代表的な問い合わせ */}
      <div>
        <h4 className="text-xs font-medium text-zinc-700 mb-1">代表的な問い合わせ</h4>
        <ul className="space-y-0.5">
          {data.meta.representativeUtterances.map((u, i) => (
            <li key={i} className="text-[11px] text-zinc-500 pl-2 border-l-2 border-zinc-200">
              {u}
            </li>
          ))}
        </ul>
      </div>

      {data.meta.skills.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-700 mb-1">使用スキル</h4>
          <ul className="space-y-1">
            {data.meta.skills.map((s, i) => (
              <li key={s} className="flex items-start gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${colors.badge}`}>{s}</span>
                <span className="text-[11px] text-zinc-500">{data.meta.skillDescriptions[i]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-1 border-t border-zinc-100">
        <p className="text-[10px] text-zinc-400">
          knowledgeFirst: <span className="font-medium">{data.meta.knowledgeFirst ? "yes" : "no"}</span>
          &nbsp;·&nbsp;priority: <span className="font-medium">{data.meta.priority}</span>
        </p>
      </div>
    </div>
  );
}
