"use client";
import type { PolicyConfigJson } from "@/lib/workflow-editor-types";

interface Props {
  config: PolicyConfigJson;
  onChange: (config: PolicyConfigJson) => void;
}

const PLACEHOLDER = `例:
・問題の深刻度が高い場合（データ消失・全機能停止など）はすぐに人間の担当者に引き継ぐ
・FAQ やヘルプ記事が見つかった場合は積極的にリンクを貼る
・初回返信では必ず顧客の名前を使って挨拶する
・確認できていない情報は「〜と思われます」などの推測表現を使う
・問題が解決したか確認してから会話を終了する`;

export function NlPolicyEditor({ config, onChange }: Props) {
  const value = config.nlPolicyInstruction ?? "";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] text-zinc-500 leading-snug mb-3">
          ボット全体の振る舞い方針を自然言語で記述します。ここに書いた内容は LLM の行動指針として直接使われます。カテゴリをまたぐ共通ルールを書いてください。
        </p>

        <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
          振る舞い方針
        </label>
        <textarea
          value={value}
          onChange={e => onChange({ ...config, nlPolicyInstruction: e.target.value })}
          placeholder={PLACEHOLDER}
          rows={12}
          className="w-full text-[12px] text-zinc-800 border border-zinc-200 rounded-md px-3 py-2.5 resize-y leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 bg-white"
        />
        <p className="text-[10px] text-zinc-400 mt-1.5 leading-snug">
          未設定の場合はデフォルトのポリシーバンドルに従います。設定した内容が優先されます。
        </p>
      </div>

      {(config.escalation_keywords?.length ?? 0) > 0 && (
        <div className="pt-2 border-t border-zinc-100">
          <p className="text-[11px] font-medium text-zinc-500 mb-1.5">エスカレーションキーワード（安全網）</p>
          <div className="flex flex-wrap gap-1">
            {config.escalation_keywords.map(kw => (
              <span key={kw} className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5">
            上記キーワードを含むメッセージは方針に関わらず即時エスカレーションします。
          </p>
        </div>
      )}
    </div>
  );
}
