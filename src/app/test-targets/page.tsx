"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, Trash2, FlaskConical, Pencil } from "lucide-react";
import type { TestTarget } from "@/lib/nocodb";

type Suggestion = { value: string; label: string; sub: string };

const SEARCHABLE_TYPES = new Set(["contact", "conversation", "email", "company"]);

const TARGET_TYPES = ["contact", "conversation", "email", "domain", "company", "plan"] as const;
const ENVIRONMENTS = ["", "prod", "staging", "dev"] as const;

const EMPTY_FORM = {
  target_type: "contact" as typeof TARGET_TYPES[number],
  target_value: "",
  label: "",
  environment: "" as string,
  concierge_key: "",
  notes: "",
  is_active: true,
};

const typeBadgeClass: Record<string, string> = {
  contact:      "bg-blue-50 text-blue-700 border-blue-200",
  conversation: "bg-purple-50 text-purple-700 border-purple-200",
  email:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  domain:       "bg-orange-50 text-orange-700 border-orange-200",
  company:      "bg-cyan-50 text-cyan-700 border-cyan-200",
  plan:         "bg-rose-50 text-rose-700 border-rose-200",
};

const typePlaceholder: Record<string, string> = {
  contact:      "例: 6123456789",
  conversation: "例: 215473985635944",
  email:        "例: user@example.com",
  domain:       "例: example.com",
  company:      "例: Example Corp",
  plan:         "例: enterprise",
};

export default function TestTargetsPage() {
  const [targets, setTargets]  = useState<TestTarget[]>([]);
  const [loading, setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]    = useState(false);
  const [form, setForm]        = useState(EMPTY_FORM);
  const [noTable, setNoTable]  = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [suggestions, setSuggestions]     = useState<Suggestion[]>([]);
  const [suggLoading, setSuggLoading]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/test-targets");
    const data = await res.json();
    if (data.list !== undefined) {
      setTargets(data.list);
    } else {
      setNoTable(true);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.target_value) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        target_type:   form.target_type,
        target_value:  form.target_value,
        label:         form.label || null,
        environment:   form.environment || null,
        concierge_key: form.concierge_key || null,
        notes:         form.notes || null,
        is_active:     form.is_active,
      };
      const res = await fetch("/api/test-targets", {
        method: editingId !== null ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId !== null ? { Id: editingId, ...payload } : payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ?? `保存失敗 (HTTP ${res.status})`);
        return;
      }
      closeForm();
      load();
    } catch (e) {
      setSaveError(`ネットワークエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
    setSuggestions([]);
  };

  const handleValueChange = (val: string, type: string) => {
    setForm(f => ({ ...f, target_value: val }));
    if (!SEARCHABLE_TYPES.has(type)) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2 && type !== "conversation") { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSuggLoading(true);
      try {
        const res = await fetch(`/api/intercom/search?type=${type}&q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch { /* ignore */ } finally {
        setSuggLoading(false);
      }
    }, 300);
  };

  const pickSuggestion = (s: Suggestion) => {
    setForm(f => ({ ...f, target_value: s.value, label: f.label || s.label.split("  ")[0] }));
    setSuggestions([]);
  };

  const startEdit = (t: TestTarget) => {
    setForm({
      target_type:   t.target_type as typeof TARGET_TYPES[number],
      target_value:  t.target_value,
      label:         t.label ?? "",
      environment:   t.environment ?? "",
      concierge_key: t.concierge_key ?? "",
      notes:         t.notes ?? "",
      is_active:     t.is_active,
    });
    setEditingId(t.Id);
    setShowForm(true);
    setSaveError(null);
  };

  const toggleActive = async (t: TestTarget) => {
    await fetch("/api/test-targets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Id: t.Id, is_active: !t.is_active }),
    });
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("このテスト対象を削除しますか？")) return;
    await fetch("/api/test-targets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Id: id }),
    });
    load();
  };

  return (
    <div className="p-6 max-w-[1100px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Test Targets</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Bot 返信を許可するテスト対象（Contact / Conversation / Email / Domain / Company / Plan）</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" onClick={() => { closeForm(); setShowForm(true); }}>
            <Plus size={13} /> 追加
          </Button>
        </div>
      </div>

      {noTable && (
        <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800 font-medium">NocoDB テーブル未設定</p>
          <p className="text-xs text-amber-700 mt-1">
            <code>support_ai_test_targets</code> テーブルを作成し、<code>NOCODB_TEST_TARGETS_TABLE_ID</code> を環境変数に設定してください。
          </p>
        </div>
      )}

      <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50">
        <div className="flex items-start gap-2">
          <FlaskConical size={14} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800">
            Bot 返信ガード（<code>ENABLE_INTERCOM_REPLY=true</code>）が有効なとき、ここに登録した対象にのみ Bot が返信します。
            <code>target_type: contact</code> / <code>conversation</code> は Intercom ID（数値または16進数）で完全一致照合。
            <code>email</code> / <code>domain</code> / <code>company</code> / <code>plan</code> は将来の Rollout Rules と連携します。
            <span className="block mt-1 text-blue-700">⚠ <strong>Env 設定について：</strong><code>prod</code> は本番環境（NODE_ENV=production）でのみ有効。ローカル開発中に試す場合は Env を空欄にしてください。</span>
          </p>
        </div>
      </div>

      {showForm && (
        <Card className="mb-4">
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">{editingId !== null ? "テスト対象を編集" : "新しいテスト対象を追加"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">種別</label>
                <select
                  value={form.target_type}
                  onChange={e => {
                    setForm(f => ({ ...f, target_type: e.target.value as typeof TARGET_TYPES[number], target_value: "" }));
                    setSuggestions([]);
                  }}
                  className="w-full h-8 text-sm px-2.5 rounded-md border border-[var(--border)] bg-zinc-50 outline-none"
                >
                  {TARGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">
                  値 * （{form.target_type === "contact" || form.target_type === "conversation" ? "Intercom ID" : form.target_type}）
                  {SEARCHABLE_TYPES.has(form.target_type) && (
                    <span className="ml-1 text-blue-500">— 2文字以上で候補を表示</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    value={form.target_value}
                    onChange={e => handleValueChange(e.target.value, form.target_type)}
                    onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                    placeholder={typePlaceholder[form.target_type]}
                    className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono"
                  />
                  {suggLoading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">検索中…</span>
                  )}
                  {suggestions.length > 0 && (
                    <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {suggestions.map(s => (
                        <li
                          key={s.value}
                          onMouseDown={() => pickSuggestion(s)}
                          className="px-3 py-2 cursor-pointer hover:bg-blue-50 flex flex-col gap-0.5"
                        >
                          <span className="text-xs font-medium text-zinc-800">{s.label}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">{s.sub}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">ラベル（任意）</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="例: 検証用アカウント"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Environment</label>
                <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
                  className="w-full h-8 text-sm px-2.5 rounded-md border border-[var(--border)] bg-zinc-50 outline-none">
                  <option value="">—</option>
                  {ENVIRONMENTS.slice(1).map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Concierge Key（任意）</label>
                <input value={form.concierge_key} onChange={e => setForm(f => ({ ...f, concierge_key: e.target.value }))}
                  placeholder="例: ptengine_support"
                  className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300 font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">メモ（任意）</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="例: β テスト参加者"
                className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
            </div>
            {saveError && (
              <div className="p-2.5 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
                {saveError}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving || !form.target_value}>
                {saving ? "保存中…" : editingId !== null ? "更新する" : "追加する"}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeForm}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <Thead>
            <tr>
              {["種別", "値", "ラベル", "Env", "Concierge", "状態", "登録日", ""].map(h => <Th key={h}>{h}</Th>)}
            </tr>
          </Thead>
          <Tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <Td key={j}><div className="h-4 bg-zinc-100 rounded animate-pulse w-16" /></Td>
                    ))}
                  </Tr>
                ))
              : targets.map(t => (
                  <Tr key={t.Id}>
                    <Td>
                      <span className={`text-[11px] px-2 py-0.5 rounded border font-mono ${typeBadgeClass[t.target_type] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                        {t.target_type}
                      </span>
                    </Td>
                    <Td className="font-mono text-xs text-[var(--text-primary)]">{t.target_value}</Td>
                    <Td className="text-xs text-[var(--text-secondary)]">{t.label || "—"}</Td>
                    <Td className="text-xs text-[var(--text-muted)] font-mono">{t.environment || "—"}</Td>
                    <Td className="text-xs text-[var(--text-muted)] font-mono">{t.concierge_key || "—"}</Td>
                    <Td>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${
                        t.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-zinc-50 text-zinc-400 border-zinc-200"
                      }`}>{t.is_active ? "有効" : "無効"}</span>
                    </Td>
                    <Td className="text-xs text-[var(--text-muted)]">{formatDate(t.CreatedAt)}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(t)} title="編集">
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                          {t.is_active ? "無効化" : "有効化"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(t.Id)}>
                          <Trash2 size={13} className="text-red-500" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
            {!loading && targets.length === 0 && !noTable && (
              <Tr>
                <Td colSpan={8} className="text-center text-sm text-[var(--text-muted)] py-8">
                  テスト対象が登録されていません
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
