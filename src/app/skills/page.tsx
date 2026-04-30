"use client";
import { useEffect, useState } from "react";
import { Zap, CheckCircle2, Clock, PauseCircle, Plus, Pencil, Trash2, X, Save, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SkillDefinition } from "@/lib/nocodb";

// ── カテゴリラベル ───────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  usage_guidance:   "使い方・操作",
  experience_issue: "体験・問題",
  bug_report:       "バグ報告",
  billing_contract: "請求・契約",
  login_account:    "ログイン・アカウント",
  tracking_issue:   "計測・タグ",
  general_inquiry:  "その他",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

const SOURCE_TYPE_LABELS: Record<string, string> = {
  knowledge_chunks_search: "ナレッジ検索（knowledge_chunks）",
  keyword_match:           "キーワードマッチ",
};

// ── デフォルトフォーム値 ──────────────────────────────────────────────────
function emptyForm(): Partial<SkillDefinition> {
  return {
    skill_key:       "",
    label:           "",
    description:     "",
    source_type:     "knowledge_chunks_search",
    source_config:   JSON.stringify({ source_type_filter: "notion_faq", limit: 5 }, null, 2),
    prompt_template: "",
    threshold:       0.65,
    status:          "active",
    intents:         "[]",
  };
}

// ── ステータスバッジ ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <span className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded"><CheckCircle2 size={10} /> active</span>;
  if (status === "disabled")
    return <span className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded"><PauseCircle size={10} /> disabled</span>;
  return <span className="flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded"><Clock size={10} /> planned</span>;
}

// ── ソースタイプ色 ─────────────────────────────────────────────────────────
const SOURCE_COLOR: Record<string, "purple" | "info" | "warning" | "muted"> = {
  knowledge_chunks_search: "info",
  keyword_match:           "warning",
};

// ── スキル編集フォーム ─────────────────────────────────────────────────────
function SkillForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial: Partial<SkillDefinition>;
  onSave: (data: Partial<SkillDefinition>) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Partial<SkillDefinition>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const intentsArr: string[] = (() => {
    try { return JSON.parse(form.intents || "[]"); } catch { return []; }
  })();

  function toggleIntent(cat: string) {
    const next = intentsArr.includes(cat)
      ? intentsArr.filter(c => c !== cat)
      : [...intentsArr, cat];
    setForm(f => ({ ...f, intents: JSON.stringify(next) }));
  }

  async function handleSave() {
    if (!form.skill_key || !form.label || !form.source_type) {
      setError("skill_key・ラベル・ソースタイプは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50 space-y-3">
      <p className="text-sm font-semibold text-zinc-700">{isNew ? "新しいスキルを追加" : "スキルを編集"}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">skill_key <span className="text-red-500">*</span></label>
          <input
            value={form.skill_key ?? ""}
            onChange={e => setForm(f => ({ ...f, skill_key: e.target.value }))}
            disabled={!isNew}
            placeholder="pricing_faq"
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">ラベル <span className="text-red-500">*</span></label>
          <input
            value={form.label ?? ""}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="料金FAQ"
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-600 mb-1">説明</label>
        <textarea
          value={form.description ?? ""}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="このスキルが何をするか説明してください"
          className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">ソースタイプ <span className="text-red-500">*</span></label>
          <select
            value={form.source_type ?? "knowledge_chunks_search"}
            onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="knowledge_chunks_search">ナレッジ検索</option>
            <option value="keyword_match">キーワードマッチ</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">閾値</label>
          <input
            type="number" min={0.1} max={1.0} step={0.05}
            value={form.threshold ?? 0.65}
            onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">ステータス</label>
          <select
            value={form.status ?? "active"}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as SkillDefinition["status"] }))}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="active">active</option>
            <option value="planned">planned</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
      </div>

      {/* source_config */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-600 mb-1">
          ソース設定（JSON）
          {form.source_type === "knowledge_chunks_search" && (
            <span className="ml-2 text-[10px] text-zinc-400 font-normal">例: {`{"source_type_filter":"notion_faq","limit":5}`}</span>
          )}
          {form.source_type === "keyword_match" && (
            <span className="ml-2 text-[10px] text-zinc-400 font-normal">例: {`{"table_id":"xxx","keyword_field":"matching_keywords","response_field":"customer_safe_message"}`}</span>
          )}
        </label>
        <textarea
          value={form.source_config ?? "{}"}
          onChange={e => setForm(f => ({ ...f, source_config: e.target.value }))}
          rows={3}
          className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 resize-none font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      {/* prompt_template (折りたたみ) */}
      <div>
        <button
          type="button"
          onClick={() => setShowPrompt(v => !v)}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700"
        >
          {showPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          LLM プロンプトテンプレート（省略可）
        </button>
        {showPrompt && (
          <textarea
            value={form.prompt_template ?? ""}
            onChange={e => setForm(f => ({ ...f, prompt_template: e.target.value }))}
            rows={5}
            placeholder={"省略するとデフォルトプロンプトが使用されます。\n{{customer_label}} でユーザー名を埋め込めます。\n最後に JSON で { confidence, answer_message, reason } を返すよう指示してください。"}
            className="mt-1 w-full text-xs border border-zinc-200 rounded px-2 py-1.5 resize-none font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        )}
      </div>

      {/* 対象インテント */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-600 mb-1">対象インテント</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleIntent(cat)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                intentsArr.includes(cat)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
        >
          <Save size={12} />
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 border border-zinc-200 rounded hover:bg-zinc-50"
        >
          <X size={12} />
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ── メインページ ────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      setSkills(data.list ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(form: Partial<SkillDefinition>) {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "作成に失敗しました");
    }
    setShowNewForm(false);
    await load();
  }

  async function handleUpdate(skillKey: string, form: Partial<SkillDefinition>) {
    const res = await fetch(`/api/skills/${skillKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "更新に失敗しました");
    }
    setEditingKey(null);
    await load();
  }

  async function handleDelete(skillKey: string) {
    if (!confirm(`"${skillKey}" を削除しますか？`)) return;
    await fetch(`/api/skills/${skillKey}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Skills</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">スキル一覧・追加・設定</p>
        </div>
        <button
          onClick={() => { setShowNewForm(true); setEditingKey(null); }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-zinc-800 text-white rounded-md hover:bg-zinc-700"
        >
          <Plus size={13} />
          スキルを追加
        </button>
      </div>

      {showNewForm && (
        <div className="mb-4">
          <SkillForm
            initial={emptyForm()}
            onSave={handleCreate}
            onCancel={() => setShowNewForm(false)}
            isNew
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">読み込み中...</p>
      ) : skills.length === 0 ? (
        <p className="text-sm text-zinc-400">スキルがまだ登録されていません。「スキルを追加」から作成してください。</p>
      ) : (
        <div className="space-y-3">
          {skills.map(skill => {
            const intentsArr: string[] = (() => {
              try { return JSON.parse(skill.intents || "[]"); } catch { return []; }
            })();

            if (editingKey === skill.skill_key) {
              return (
                <SkillForm
                  key={skill.skill_key}
                  initial={{ ...skill }}
                  onSave={(form) => handleUpdate(skill.skill_key, form)}
                  onCancel={() => setEditingKey(null)}
                  isNew={false}
                />
              );
            }

            return (
              <Card key={skill.skill_key}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      skill.status === "active" ? "bg-zinc-900" : "bg-zinc-100"
                    }`}>
                      <Zap size={14} className={skill.status === "active" ? "text-white" : "text-zinc-400"} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{skill.skill_key}</span>
                        <StatusBadge status={skill.status} />
                        <span className="text-[11px] text-zinc-400">{skill.label}</span>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-[var(--text-muted)] mb-3">{skill.description}</p>
                      )}

                      <div className="grid grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Intents</p>
                          {intentsArr.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {intentsArr.map(cat => (
                                <span key={cat} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                                  {CATEGORY_LABELS[cat] ?? cat}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-400">—</span>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Source</p>
                          <Badge variant={SOURCE_COLOR[skill.source_type] ?? "muted"}>
                            {SOURCE_TYPE_LABELS[skill.source_type] ?? skill.source_type}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Threshold</p>
                          <span className="font-mono text-[var(--text-secondary)]">≥ {skill.threshold}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingKey(skill.skill_key); setShowNewForm(false); }}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded"
                        title="編集"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(skill.skill_key)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="削除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
        <p className="text-[11px] font-semibold text-zinc-600 mb-1">スキルの仕組み</p>
        <ul className="text-[11px] text-zinc-500 space-y-1 list-disc list-inside">
          <li><strong>ナレッジ検索</strong> — knowledge_chunks テーブルを source_type_filter で絞り込み、LLM で回答を生成します</li>
          <li><strong>キーワードマッチ</strong> — 指定した NocoDB テーブルのキーワードと照合し、一致したレコードの返答文を使います</li>
          <li>スキルは対象インテントのカテゴリで bot が判定された際に自動実行されます</li>
          <li>閾値を下回る回答は採用されず、通常の質問収集フローに戻ります</li>
        </ul>
      </div>
    </div>
  );
}
