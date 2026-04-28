"use client";
import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { PolicyConfigJson } from "@/lib/workflow-editor-types";
import { HANDOFF_EAGERNESS_META } from "@/lib/workflow-editor-types";

interface Props {
  config: PolicyConfigJson;
  onChange: (config: PolicyConfigJson) => void;
}

export function PolicyConfigEditor({ config, onChange }: Props) {
  const [newKeyword, setNewKeyword] = useState("");

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (!kw || config.escalation_keywords.includes(kw)) return;
    onChange({ ...config, escalation_keywords: [...config.escalation_keywords, kw] });
    setNewKeyword("");
  };

  const removeKeyword = (kw: string) => {
    onChange({ ...config, escalation_keywords: config.escalation_keywords.filter(k => k !== kw) });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addKeyword(); }
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-zinc-500 leading-snug">
        エスカレーションキーワードと担当者引き継ぎの積極度を設定します。設定がない場合はシステムデフォルトを使用します。
      </p>

      {/* Escalation keywords */}
      <div>
        <p className="text-xs font-medium text-zinc-700 mb-2">エスカレーションキーワード</p>
        <p className="text-[11px] text-zinc-400 mb-2 leading-snug">
          含まれると即時エスカレーション。空の場合はシステムデフォルトを使用。
        </p>

        {config.escalation_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {config.escalation_keywords.map(kw => (
              <span key={kw} className="flex items-center gap-1 text-[11px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-red-900">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <input
            type="text"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="キーワードを追加"
            className="flex-1 text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <button
            onClick={addKeyword}
            disabled={!newKeyword.trim()}
            className="flex items-center gap-1 text-xs px-2 py-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={12} /> 追加
          </button>
        </div>

        {config.escalation_keywords.length === 0 && (
          <p className="text-[10px] text-zinc-400 mt-1.5">
            システムデフォルト: 至急, 緊急, 全く使えない, 障害, 返金, …
          </p>
        )}
      </div>

      {/* Handoff eagerness */}
      <div>
        <p className="text-xs font-medium text-zinc-700 mb-2">引き継ぎ積極度</p>
        <div className="flex gap-1.5">
          {(["eager", "normal", "conservative"] as const).map(level => {
            const meta = HANDOFF_EAGERNESS_META[level];
            const active = config.handoff_eagerness === level;
            return (
              <button
                key={level}
                onClick={() => onChange({ ...config, handoff_eagerness: level })}
                className={`flex-1 py-1.5 rounded text-[11px] font-medium border transition-colors ${
                  active
                    ? "bg-zinc-800 text-white border-zinc-800"
                    : "text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5">
          {HANDOFF_EAGERNESS_META[config.handoff_eagerness].desc}
        </p>
      </div>
    </div>
  );
}
