"use client";
import { useEffect, useState } from "react";
import { groupColor, type PolicyDoc } from "@/lib/policy-types";
import { MarkdownView } from "@/components/ui/markdown";
import { FileText, GitBranch, AlertTriangle, BookOpen, Zap, ArrowRight, Pencil, Save, X, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";

type RootCause = "wrong_category" | "workflow_issue" | "wrong_knowledge" | "missing_faq" | "skill_gap";
type PolicyActionType = "adjust_workflow" | "update_knowledge";

const ROOT_CAUSE_GUIDE: Record<RootCause, {
  title: string; desc: string; focusGroup: string; focusFile: string | null;
  nextPage?: { label: string; href: string };
}> = {
  wrong_category: {
    title: "Intent 分類の修正が必要です",
    desc: "classifier_prompt.md に境界定義を追記することで、このカテゴリへの分類精度を上げられます。",
    focusGroup: "prompts", focusFile: "ai-support-bot-md/prompts/classifier_prompt.md",
  },
  workflow_issue: {
    title: "ボットの行動フローに問題があります",
    desc: "Global Behavior または Handoff ポリシーを見直し、このパターンへの対応を追記してください。",
    focusGroup: "behavior", focusFile: "ai-support-bot-md/policies/01_global_behavior.md",
  },
  wrong_knowledge: {
    title: "ナレッジ参照ルールの修正が必要です",
    desc: "Source Priority ポリシーを確認し、正しいナレッジが優先されるよう調整してください。",
    focusGroup: "knowledge", focusFile: "ai-support-bot-md/knowledge/policies/source_priority.md",
    nextPage: { label: "Knowledge を更新する", href: "/knowledge" },
  },
  missing_faq: {
    title: "FAQ エントリが不足しています",
    desc: "Knowledge ページで FAQ チャンクを追加してください。",
    focusGroup: "knowledge", focusFile: null,
    nextPage: { label: "Knowledge を開く", href: "/knowledge" },
  },
  skill_gap: {
    title: "Skill 設定の見直しが必要です",
    desc: "Skill の発動条件や FAQ エントリを確認・追加してください。",
    focusGroup: "skills", focusFile: "ai-support-bot-md/skills/README.md",
    nextPage: { label: "Skills を開く", href: "/skills" },
  },
};

// action_type から対応する root_cause ガイドにマッピング
const ACTION_TYPE_TO_GUIDE: Record<PolicyActionType, RootCause> = {
  adjust_workflow: "workflow_issue",
  update_knowledge: "wrong_knowledge",
};

const GROUP_ORDER = ["behavior", "escalation", "handoff", "knowledge", "prompts", "skills"] as const;

type EditState = {
  policyId: string;
  content: string;
  sha: string;
  status: "editing" | "saving" | "saved" | "error";
  commitUrl?: string;
  error?: string;
};

export default function PoliciesPage() {
  const [policies,      setPolicies]    = useState<PolicyDoc[]>([]);
  const [githubReady,   setGithubReady] = useState(false);
  const [loading,       setLoading]     = useState(true);
  const [expandedId,    setExpandedId]  = useState<string | null>(null);
  const [editState,     setEditState]   = useState<EditState | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  // URL params
  const [fromSandbox,   setFromSandbox]   = useState(false);
  const [rootCause,     setRootCause]     = useState<RootCause | "">("");
  const [actionType,    setActionType]    = useState<PolicyActionType | "">("");
  const [actionContent, setActionContent] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFromSandbox(p.get("from") === "sandbox");
    setRootCause((p.get("root_cause") ?? "") as RootCause | "");
    setActionType((p.get("action_type") ?? "") as PolicyActionType | "");
    setActionContent(p.get("action_content") ?? "");
  }, []);

  useEffect(() => {
    fetch("/api/policies")
      .then(r => r.json())
      .then(d => { setPolicies(d.list ?? []); setGithubReady(d.githubReady ?? false); })
      .finally(() => setLoading(false));
  }, []);

  // action_type が指定されていればそちらを優先（root_cause は LLM が設定するため、リンク元アクションと一致しないことがある）
  const effectiveRootCause: RootCause | "" =
    (actionType && ACTION_TYPE_TO_GUIDE[actionType]) ||
    (rootCause as RootCause | "");
  const guide = effectiveRootCause && ROOT_CAUSE_GUIDE[effectiveRootCause] ? ROOT_CAUSE_GUIDE[effectiveRootCause] : null;

  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    label: policies.find(p => p.group === g)?.groupLabel ?? g,
    items: policies.filter(p => p.group === g),
  })).filter(g => g.items.length > 0);

  async function startEdit(policy: PolicyDoc) {
    if (!githubReady) return;
    setLoadingEditId(policy.id);
    try {
      const res = await fetch(`/api/policies/${policy.id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEditState({ policyId: policy.id, content: data.content, sha: data.sha, status: "editing" });
      setExpandedId(policy.id);
    } catch (err) {
      alert("編集データの取得に失敗しました: " + String(err));
    } finally {
      setLoadingEditId(null);
    }
  }

  async function saveEdit() {
    if (!editState) return;
    setEditState(s => s ? { ...s, status: "saving" } : s);
    try {
      const res = await fetch(`/api/policies/${editState.policyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editState.content, sha: editState.sha }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setEditState(s => s ? { ...s, status: "saved", commitUrl: data.commitUrl } : s);
      // ポリシー一覧を再取得してコンテンツ更新
      fetch("/api/policies").then(r => r.json()).then(d => setPolicies(d.list ?? []));
    } catch (err) {
      setEditState(s => s ? { ...s, status: "error", error: String(err) } : s);
    }
  }

  function cancelEdit() {
    setEditState(null);
  }

  return (
    <div className="p-6 max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Policies</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Bot の行動ルール・プロンプト定義（ai-support-bot-md/ から読み込み）
        </p>
      </div>

      {/* GitHub 未設定の場合のバナー */}
      {!githubReady && !loading && (
        <div className="mb-5 p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-600 flex items-start gap-2">
          <GitBranch size={14} className="mt-0.5 shrink-0 text-zinc-400" />
          <span>
            <strong>インライン編集を有効にするには：</strong>{" "}
            Vercel 環境変数に <code className="bg-zinc-100 px-1 rounded">GITHUB_TOKEN</code>（repo スコープの PAT）を追加してください。
            {" "}<a href="https://github.com/settings/tokens/new?scopes=repo&description=BotAdmin+policy+editor" target="_blank" rel="noreferrer" className="text-blue-600 underline">トークンを発行 →</a>
          </span>
        </div>
      )}

      {/* Sandbox からのコンテキストバナー */}
      {fromSandbox && guide && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-amber-800">{guide.title}</p>
              <p className="text-xs text-amber-700 leading-relaxed">{guide.desc}</p>
            </div>
          </div>

          {actionContent && (
            <div className="bg-white rounded-md border border-amber-200 p-3 space-y-1">
              <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Sandbox が提案した修正内容</p>
              <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{actionContent}</p>
            </div>
          )}

          <div className="bg-white rounded-md border border-amber-200 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">対応手順</p>
            <ol className="text-xs text-zinc-700 space-y-2 list-none">
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                <span>下のリストから <strong>該当ファイル</strong>（ハイライト表示）の「編集」をクリックして内容を開く</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                <span>上の提案内容を参考に Markdown を修正し、<strong>「保存してデプロイ」</strong>をクリックする</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                <span>デプロイ完了後、Sandbox で同じシナリオを再実行して改善を確認</span>
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {guide.nextPage && (
              <a href={guide.nextPage.href}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 font-medium transition-colors">
                <BookOpen size={12} /> {guide.nextPage.label} <ArrowRight size={11} />
              </a>
            )}
            <a href="/sandbox"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 font-medium transition-colors">
              <Zap size={12} /> Sandbox に戻る
            </a>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ group, label, items }) => {
            const isHighlighted = guide?.focusGroup === group;
            return (
              <section key={group} id={`group-${group}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${groupColor(group as Parameters<typeof groupColor>[0])}`}>
                    {label}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{items.length} ファイル</span>
                  {isHighlighted && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-1">
                      <AlertTriangle size={9} /> 要確認
                    </span>
                  )}
                </div>

                <div className={`space-y-2 ${isHighlighted ? "ring-2 ring-amber-200 ring-offset-2 rounded-lg p-1" : ""}`}>
                  {items.map(policy => {
                    const isTargetFile = guide?.focusFile === policy.file;
                    const isExpanded   = expandedId === policy.id;
                    const isEditing    = editState?.policyId === policy.id;
                    const isLoadingEdit = loadingEditId === policy.id;

                    return (
                      <div key={policy.id}
                        className={`rounded-lg border bg-white overflow-hidden ${isTargetFile ? "border-amber-300" : "border-[var(--border)]"}`}>

                        {/* ヘッダー */}
                        <div className={`flex items-start justify-between gap-3 p-4 ${isTargetFile ? "bg-amber-50" : ""}`}>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : policy.id)}
                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                          >
                            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isTargetFile ? "bg-amber-100" : "bg-zinc-100"}`}>
                              <FileText size={13} className={isTargetFile ? "text-amber-500" : "text-zinc-400"} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-[var(--text-primary)]">{policy.title}</p>
                                {isTargetFile && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                                    ← ここを編集
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{policy.summary}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] font-mono text-zinc-400">{policy.file}</span>
                                <span className="text-[10px] text-zinc-400">更新: {formatDate(policy.lastModifiedISO)}</span>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">active</span>
                            {githubReady && !isEditing && (
                              <button
                                onClick={() => startEdit(policy)}
                                disabled={isLoadingEdit}
                                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-40 transition-colors"
                              >
                                {isLoadingEdit
                                  ? <RefreshCw size={10} className="animate-spin" />
                                  : <Pencil size={10} />}
                                編集
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : policy.id)}
                              className="text-xs text-zinc-400 hover:text-zinc-600"
                            >
                              {isExpanded ? "▼ 閉じる" : "▶ 展開"}
                            </button>
                          </div>
                        </div>

                        {/* コンテンツ / エディタ */}
                        {isExpanded && (
                          <div className="border-t border-[var(--border-subtle)]">
                            {isEditing ? (
                              <div className="p-4 space-y-3">
                                {/* 保存済みバナー */}
                                {editState?.status === "saved" && (
                                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                    <CheckCircle2 size={13} />
                                    保存しました。Vercel が自動デプロイを開始しました（約40秒で反映）。
                                    {editState.commitUrl && (
                                      <a href={editState.commitUrl} target="_blank" rel="noreferrer"
                                        className="ml-auto flex items-center gap-1 text-emerald-700 hover:underline">
                                        コミットを確認 <ExternalLink size={10} />
                                      </a>
                                    )}
                                  </div>
                                )}
                                {editState?.status === "error" && (
                                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                    {editState.error}
                                  </div>
                                )}
                                <textarea
                                  value={editState?.content ?? ""}
                                  onChange={e => setEditState(s => s ? { ...s, content: e.target.value, status: "editing" } : s)}
                                  rows={Math.max(10, (editState?.content ?? "").split("\n").length + 2)}
                                  className="w-full text-xs font-mono px-3 py-2 rounded-md border border-zinc-200 bg-zinc-50 resize-y outline-none focus:ring-1 focus:ring-zinc-400 leading-relaxed"
                                  spellCheck={false}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={saveEdit}
                                    disabled={editState?.status === "saving"}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-40 font-medium transition-colors"
                                  >
                                    {editState?.status === "saving"
                                      ? <><RefreshCw size={11} className="animate-spin" /> 保存中…</>
                                      : <><Save size={11} /> 保存してデプロイ</>}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                                  >
                                    <X size={11} /> キャンセル
                                  </button>
                                  <span className="ml-auto text-[10px] text-zinc-400">
                                    保存すると GitHub にコミット → Vercel が自動デプロイ
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="px-5 pb-5 pt-3">
                                <MarkdownView content={policy.content} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 編集方法ガイド */}
      <div className="mt-8 p-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={14} className="text-zinc-400" />
          <p className="text-xs font-semibold text-zinc-600">
            {githubReady ? "インライン編集が有効です" : "インライン編集の有効化"}
          </p>
        </div>
        {githubReady ? (
          <p className="text-xs text-zinc-500">
            各ポリシーの「編集」ボタンから直接編集できます。保存すると GitHub にコミットされ、Vercel が約40秒で自動デプロイします。
          </p>
        ) : (
          <ol className="text-xs text-[var(--text-muted)] space-y-2 list-none">
            {[
              { step: "1", text: <><a href="https://github.com/settings/tokens/new?scopes=repo&description=BotAdmin+policy+editor" target="_blank" rel="noreferrer" className="text-blue-600 underline">GitHub PAT を発行</a>（<code className="bg-zinc-100 px-1 rounded font-mono">repo</code> スコープのみ）</> },
              { step: "2", text: <>Vercel 環境変数に <code className="bg-zinc-100 px-1 rounded font-mono">GITHUB_TOKEN</code> として追加 → 再デプロイ</> },
              { step: "3", text: <>このページを再読み込みすると各ポリシーに「編集」ボタンが表示されます</> },
            ].map(({ step, text }) => (
              <li key={step} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{step}</span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
