"use client";
import type { TerminalNodeData } from "@/lib/workflow-types";
import type { PolicyConfigJson } from "@/lib/workflow-editor-types";

const TYPE_INFO: Record<string, { label: string; desc: string; badge: string }> = {
  reply:         { label: "AI返答",         desc: "スキルの実行結果を顧客に返信します。スキルが十分な信頼スコアを持つ場合にのみ使用されます。",              badge: "text-green-700 bg-green-50 border-green-200" },
  handoff:       { label: "担当者引き継ぎ",  desc: "収集したスロット情報とともに、担当者へ転送します。ハンドオフ判定ノードで条件を満たした場合に実行されます。",  badge: "text-amber-700 bg-amber-50 border-amber-200" },
  next_question: { label: "スロット収集",    desc: "ハンドオフに必要な情報がまだ揃っていない場合、追加の質問を行って情報収集を続けます。",                   badge: "text-blue-700 bg-blue-50 border-blue-200"   },
  escalation:    { label: "エスカレーション", desc: "高リスクと判定されたケースを即座に担当者へ通知します。通常の引き継ぎフローをスキップします。",              badge: "text-red-700 bg-red-50 border-red-200"      },
};

const DEFAULT_ESCALATION_KEYWORDS = ["至急", "緊急", "全く使えない", "障害", "返金", "全員使えない", "全社員", "本番が止まっている"];

interface Props {
  data: TerminalNodeData;
  onClose: () => void;
  policyConfig?: PolicyConfigJson;
  onOpenPolicyEditor?: () => void;
}

export function TerminalPanel({ data, onClose, policyConfig, onOpenPolicyEditor }: Props) {
  const info = TYPE_INFO[data.terminalType] ?? TYPE_INFO.reply;
  const isEscalation = data.terminalType === "escalation";
  const keywords = policyConfig?.escalation_keywords ?? [];
  const displayKeywords = keywords.length > 0 ? keywords : DEFAULT_ESCALATION_KEYWORDS;
  const usingDefault = keywords.length === 0;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${info.badge}`}>
          {info.label}
        </span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed">{info.desc}</p>

      {isEscalation && (
        <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-red-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-red-700">エスカレーション判断ルール</span>
              {usingDefault && (
                <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">デフォルト</span>
              )}
              {!usingDefault && (
                <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">✓ カスタム</span>
              )}
            </div>
          </div>
          <div className="px-3 py-2.5 space-y-2">
            <p className="text-[10px] text-red-600 leading-snug">
              以下のキーワードを含むメッセージは即時エスカレーション（スロット収集・handoff フローをスキップ）
            </p>
            <div className="flex flex-wrap gap-1">
              {displayKeywords.map(kw => (
                <span key={kw} className="text-[10px] bg-white border border-red-200 text-red-700 px-1.5 py-0.5 rounded-full">
                  {kw}
                </span>
              ))}
            </div>
            {onOpenPolicyEditor && (
              <button
                onClick={onOpenPolicyEditor}
                className="w-full mt-1 px-3 py-1.5 text-[11px] bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                ポリシー設定を開く →
              </button>
            )}
            {!onOpenPolicyEditor && (
              <p className="text-[10px] text-zinc-400">ワークフローを選択するとキーワードを編集できます</p>
            )}
          </div>
        </div>
      )}

      <div className="pt-1 border-t border-zinc-100">
        <p className="text-[10px] text-zinc-400">
          type: <code className="font-mono bg-zinc-100 px-1 rounded">{data.terminalType}</code>
        </p>
      </div>
    </div>
  );
}
