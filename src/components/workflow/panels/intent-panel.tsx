"use client";
import { useState } from "react";
import type { IntentNodeData } from "@/lib/workflow-types";
import { INTENT_COLOR_CLASSES } from "@/lib/workflow-types";

interface Props {
  data: IntentNodeData & { naturalLanguageDesc?: string };
  nlInstruction?: string;
  onClose: () => void;
  onSave?: (naturalLanguageDesc: string) => void;
  onSaveNLInstruction?: (nlInstruction: string) => void;
}

export function IntentPanel({ data, nlInstruction, onClose, onSave, onSaveNLInstruction }: Props) {
  const colors = INTENT_COLOR_CLASSES[data.meta.color] ?? INTENT_COLOR_CLASSES["blue"];
  const [desc, setDesc] = useState(data.naturalLanguageDesc ?? "");
  const [nlText, setNlText] = useState(nlInstruction ?? "");

  return (
    <div className="p-4 space-y-3">
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

      {/* ── ボット対応方針（自然言語指示）────────────────── */}
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-emerald-700">ボット対応方針（自然言語指示）</p>
        <p className="text-[10px] text-emerald-600 leading-relaxed">
          「どの情報を収集し、いつ担当者に引き継ぐか」を自然言語で記述します。
          ボットエンジンがこの指示を参照して動作を決定します。
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

      {onSave && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-blue-700">ノード表示説明（カスタマイズ）</p>
          {desc && (
            <p className="text-[11px] text-blue-600 italic border-l-2 border-blue-300 pl-2">
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
