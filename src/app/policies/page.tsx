import { loadPolicies, groupColor } from "@/lib/policy-reader";
import { MarkdownView } from "@/components/ui/markdown";
import { FileText, GitBranch } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GROUP_ORDER = ["behavior", "escalation", "handoff", "knowledge", "prompts", "skills"] as const;

export default function PoliciesPage() {
  const policies = loadPolicies();
  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    label: policies.find(p => p.group === g)?.groupLabel ?? g,
    items: policies.filter(p => p.group === g),
  })).filter(g => g.items.length > 0);

  return (
    <div className="p-6 max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Policies</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Bot の行動ルール・プロンプト定義（ai-support-bot-md/ から読み込み）
        </p>
      </div>

      {/* Improvement guide link */}
      <div className="mb-6 p-3 rounded-lg border border-blue-100 bg-blue-50 flex items-start gap-2 text-xs text-blue-700">
        <span className="mt-0.5">💡</span>
        <span>
          <strong>改善導線：</strong>
          Evaluation で <code className="bg-blue-100 px-1 rounded">over_handoff</code> や <code className="bg-blue-100 px-1 rounded">over_questioning</code> が多い場合は Handoff / スロット収集 ポリシーを確認してください。
          <code className="bg-blue-100 px-1 rounded">intent_misclassification</code> は classifier_prompt を見直してください。
        </span>
      </div>

      <div className="space-y-8">
        {grouped.map(({ group, label, items }) => (
          <section key={group}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${groupColor(group as Parameters<typeof groupColor>[0])}`}>
                {label}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{items.length} ファイル</span>
            </div>

            <div className="space-y-2">
              {items.map(policy => (
                <details key={policy.id} className="group rounded-lg border border-[var(--border)] bg-white overflow-hidden">
                  <summary className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-zinc-50 list-none select-none">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={13} className="text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{policy.title}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{policy.summary}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] font-mono text-zinc-400">{policy.file}</span>
                          <span className="text-[10px] text-zinc-400">更新: {formatDate(policy.lastModifiedISO)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                        active
                      </span>
                      <span className="text-xs text-zinc-400 group-open:hidden">▶ 展開</span>
                      <span className="text-xs text-zinc-400 hidden group-open:block">▼ 閉じる</span>
                    </div>
                  </summary>
                  <div className="px-5 pb-5 pt-1 border-t border-[var(--border-subtle)]">
                    <MarkdownView content={policy.content} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Edit guide */}
      <div className="mt-8 p-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch size={14} className="text-zinc-400" />
          <p className="text-xs font-semibold text-zinc-600">ポリシーの更新方法</p>
        </div>
        <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
          <li>VSCode で <code className="bg-zinc-100 px-1 rounded">ai-support-bot-md/</code> 内のファイルを編集</li>
          <li>Sandbox（/sandbox）で発話を入力し、意図した動作になるか確認</li>
          <li>問題なければ <code className="bg-zinc-100 px-1 rounded">git push origin main</code> → Vercel 自動デプロイで反映</li>
        </ol>
        <p className="text-[11px] text-zinc-400 mt-2">インライン編集機能は次フェーズで追加予定。詳細は docs/policy_intent_management.md を参照。</p>
      </div>
    </div>
  );
}
