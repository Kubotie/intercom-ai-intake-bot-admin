"use client";
import { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, CheckCircle2, AlertCircle, FileText } from "lucide-react";

type Prompt = {
  Id: number;
  prompt_key: string;
  content: string;
  description: string;
  is_active: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PromptsPage() {
  const [prompts, setPrompts]   = useState<Prompt[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [draft, setDraft]       = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/prompts");
    const data = await res.json();
    setPrompts(data.list ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const select = (p: Prompt) => {
    setSelected(p);
    setDraft(p.content ?? "");
    setSaveState("idle");
    setErrorMsg("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const save = async () => {
    if (!selected) return;
    setSaveState("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: selected.Id, content: draft }),
      });
      if (!res.ok) throw new Error(await res.text());
      // ローカル state も更新
      setPrompts(ps => ps.map(p => p.Id === selected.Id ? { ...p, content: draft } : p));
      setSelected(s => s ? { ...s, content: draft } : s);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setSaveState("error");
    }
  };

  const isDirty = selected && draft !== selected.content;

  return (
    <div className="p-6 flex gap-6 h-[calc(100vh-64px)]">
      {/* 左: プロンプト一覧 */}
      <div className="w-64 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Prompts</h1>
          <button onClick={load} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-2">
          NocoDB に保存。変更は最大60秒で反映。
        </p>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">読み込み中…</p>
        ) : prompts.map(p => (
          <button
            key={p.Id}
            onClick={() => select(p)}
            className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
              selected?.Id === p.Id
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-[var(--text-primary)] border-[var(--border)] hover:bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={12} className="shrink-0" />
              <span className="font-mono text-xs font-medium truncate">{p.prompt_key}</span>
            </div>
            {p.description && (
              <p className={`text-[11px] mt-0.5 truncate ${selected?.Id === p.Id ? "text-zinc-300" : "text-[var(--text-muted)]"}`}>
                {p.description}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* 右: エディタ */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{selected.prompt_key}</span>
                  {selected.is_active ? <Badge variant="success">active</Badge> : null}
                </div>
                {selected.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{selected.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {saveState === "saved" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 size={12} /> 保存済み
                  </span>
                )}
                {saveState === "error" && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle size={12} /> {errorMsg}
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!isDirty || saveState === "saving"}
                  className="flex items-center gap-1.5"
                >
                  <Save size={13} />
                  {saveState === "saving" ? "保存中…" : "保存"}
                </Button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); setSaveState("idle"); }}
              className="flex-1 w-full font-mono text-sm p-4 border border-[var(--border)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-[var(--text-primary)]"
              spellCheck={false}
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              {`${draft.length} 文字　　{{variable_name}} 形式でスキル変数を埋め込み可能`}
            </p>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
            左のリストからプロンプトを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
