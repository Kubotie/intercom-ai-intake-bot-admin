"use client";
import { useState, useEffect } from "react";
import type { TestTargetNodeData } from "@/lib/workflow-types";
import { TARGET_TYPE_COLORS } from "@/lib/workflow-types";

interface Props {
  data: TestTargetNodeData;
  conciergeKeys: string[];
  onClose: () => void;
  onSaved: () => void;
}

const TARGET_TYPES = ["contact", "conversation", "email", "domain", "company", "plan"];

export function TestTargetPanel({ data, conciergeKeys, onClose, onSaved }: Props) {
  const [targetType,   setTargetType]   = useState(data.targetType);
  const [targetValue,  setTargetValue]  = useState(data.targetValue);
  const [label,        setLabel]        = useState(data.label ?? "");
  const [conciergeKey, setConciergeKey] = useState(data.conciergeKey ?? "");
  const [isActive,     setIsActive]     = useState(data.isActive);
  const [saving, setSaving]             = useState(false);
  const [error,  setError]              = useState<string | null>(null);

  useEffect(() => {
    setTargetType(data.targetType);
    setTargetValue(data.targetValue);
    setLabel(data.label ?? "");
    setConciergeKey(data.conciergeKey ?? "");
    setIsActive(data.isActive);
    setError(null);
  }, [data.targetId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/test-targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id:            data.targetId,
          target_type:   targetType,
          target_value:  targetValue,
          label:         label || null,
          concierge_key: conciergeKey || null,
          is_active:     isActive,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-zinc-900">ターゲット設定</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">タイプ</label>
        <div className="flex flex-wrap gap-1.5">
          {TARGET_TYPES.map((t) => {
            const c = TARGET_TYPE_COLORS[t] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
            return (
              <button
                key={t}
                onClick={() => setTargetType(t)}
                className={`text-xs px-2 py-0.5 rounded border font-medium ${targetType === t ? c : "bg-white text-zinc-500 border-zinc-200"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">値</label>
        <input
          type="text"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="例: user@example.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">ラベル（任意）</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="例: テストユーザーA"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">コンシェルジュ</label>
        <select
          value={conciergeKey}
          onChange={(e) => setConciergeKey(e.target.value)}
          className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">（main を使用）</option>
          {conciergeKeys.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded"
        />
        <span className="text-xs text-zinc-600">有効</span>
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
