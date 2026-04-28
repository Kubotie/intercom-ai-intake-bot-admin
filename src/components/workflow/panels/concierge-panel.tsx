"use client";
import { useState, useEffect } from "react";
import type { ConciergeNodeData } from "@/lib/workflow-types";
import { SKILL_LABELS, INTENT_META } from "@/lib/workflow-types";

type ProfileEntry = { key: string; label: string; desc: string };
type ProfileCatalog = {
  policyProfiles: ProfileEntry[];
  skillProfiles: ProfileEntry[];
  sourcePriorityProfiles: ProfileEntry[];
};

// Skill profile → visual order string per category
const SKILL_PROFILE_ORDERS: Record<string, Record<string, string[]>> = {
  default:              {},
  faq_first:            { usage_guidance: ["faq_answer", "help_center_answer"], experience_issue: ["faq_answer", "help_center_answer"] },
  help_center_first:    { usage_guidance: ["help_center_answer", "faq_answer"], experience_issue: ["help_center_answer", "faq_answer"] },
  known_bug_first:      { bug_report: ["known_bug_match", "faq_answer"], experience_issue: ["known_bug_match", "faq_answer", "help_center_answer"] },
  experience_specialist:{ experience_issue: ["faq_answer", "help_center_answer", "known_bug_match"], usage_guidance: ["faq_answer", "help_center_answer"] },
};

const SOURCE_ALLOWED: Record<string, string[]> = {
  default:           ["Help Center", "FAQ", "既知バグ"],
  help_center_first: ["Help Center", "FAQ", "既知バグ"],
  faq_first:         ["FAQ", "Help Center", "既知バグ"],
  internal_heavy:    ["FAQ", "CSE", "Help Center", "既知バグ"],
  safe_public_only:  ["Help Center のみ"],
  premium_safe:      ["Help Center", "FAQ"],
};

const POLICY_SUMMARY: Record<string, { eagerness: string; keywords: string }> = {
  default_support:    { eagerness: "標準",       keywords: "至急・緊急・返金…" },
  careful_escalation: { eagerness: "保守的",      keywords: "訴える・SNS・口コミ…" },
  self_serve_first:   { eagerness: "セルフ優先",  keywords: "至急・緊急・障害…" },
  premium_high_touch: { eagerness: "早め引き継ぎ", keywords: "不満・困っています…" },
};

interface Props {
  data: ConciergeNodeData;
  onClose: () => void;
  onSaved: () => void;
}

export function ConciergePanel({ data, onClose, onSaved }: Props) {
  const [catalog, setCatalog]   = useState<ProfileCatalog | null>(null);
  const [policyKey, setPolicyKey]   = useState(data.policySetKey ?? "default_support");
  const [skillKey,  setSkillKey]    = useState(data.skillProfileKey ?? "default");
  const [sourceKey, setSourceKey]   = useState(data.sourcePriorityProfileKey ?? "default");
  const [saving,    setSaving]      = useState(false);
  const [error,     setError]       = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setError("プロファイル一覧の取得に失敗しました"));
  }, []);

  useEffect(() => {
    setPolicyKey(data.policySetKey ?? "default_support");
    setSkillKey(data.skillProfileKey ?? "default");
    setSourceKey(data.sourcePriorityProfileKey ?? "default");
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.conciergeId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/concierges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id:                          data.conciergeId,
          policy_set_key:              policyKey,
          skill_profile_key:           skillKey,
          source_priority_profile_key: sourceKey,
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
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900">{data.displayName}</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">{data.conciergeKey}</p>
          {data.isMain && <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">main</span>}
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      {/* Profile selects */}
      {!catalog && !error && <p className="text-xs text-zinc-400">読み込み中…</p>}
      {catalog && (
        <div className="space-y-3">
          <ProfileSelect label="Policy Profile"         value={policyKey}  options={catalog.policyProfiles}         onChange={setPolicyKey} />
          <ProfileSelect label="Skill Profile"          value={skillKey}   options={catalog.skillProfiles}          onChange={setSkillKey} />
          <ProfileSelect label="Source Priority Profile" value={sourceKey}  options={catalog.sourcePriorityProfiles} onChange={setSourceKey} />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !catalog}
        className="w-full py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>

      {/* Profile Preview (collapsible) */}
      <div className="border-t border-zinc-100 pt-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 w-full text-left"
        >
          <span>{showPreview ? "▾" : "▸"}</span>
          <span>プロファイルの内容を見る</span>
        </button>

        {showPreview && (
          <div className="mt-3 space-y-3">
            {/* Policy preview */}
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Policy</p>
              {POLICY_SUMMARY[policyKey] ? (
                <div className="text-[10px] space-y-0.5">
                  <p>ハンドオフ強度: <span className="font-medium text-zinc-700">{POLICY_SUMMARY[policyKey].eagerness}</span></p>
                  <p>エスカレーション: <span className="text-zinc-600">{POLICY_SUMMARY[policyKey].keywords}</span></p>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-400">{policyKey}</p>
              )}
            </div>

            {/* Skill order preview */}
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Skill 実行順</p>
              <SkillOrderPreview skillProfileKey={skillKey} />
            </div>

            {/* Source preview */}
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">参照ソース</p>
              <div className="flex flex-wrap gap-1">
                {(SOURCE_ALLOWED[sourceKey] ?? ["—"]).map((s) => (
                  <span key={s} className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skill order visual ────────────────────────────────────────────────────────

function SkillOrderPreview({ skillProfileKey }: { skillProfileKey: string }) {
  const overrides = SKILL_PROFILE_ORDERS[skillProfileKey] ?? {};
  const skillCategories = Object.entries(INTENT_META).filter(([, m]) => m.skills.length > 0);

  if (Object.keys(overrides).length === 0) {
    return (
      <div className="space-y-1">
        {skillCategories.map(([cat, meta]) => (
          <SkillOrderRow key={cat} label={meta.label} skills={meta.skills} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {skillCategories.map(([cat, meta]) => {
        const order = overrides[cat] ?? meta.skills;
        const changed = overrides[cat] !== undefined;
        return (
          <SkillOrderRow
            key={cat}
            label={meta.label}
            skills={order}
            changed={changed}
          />
        );
      })}
    </div>
  );
}

function SkillOrderRow({ label, skills, changed }: { label: string; skills: string[]; changed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={`w-20 shrink-0 truncate ${changed ? "text-blue-600 font-medium" : "text-zinc-500"}`}>
        {label}
      </span>
      <span className="text-zinc-300">→</span>
      <div className="flex gap-1 flex-wrap">
        {skills.map((s, i) => (
          <span key={s} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-zinc-300 text-[9px]">→</span>}
            <span className={`px-1 py-0.5 rounded ${changed ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-600"}`}>
              {SKILL_LABELS[s] ?? s}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── ProfileSelect ─────────────────────────────────────────────────────────────

function ProfileSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: ProfileEntry[];
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => o.key === value);
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label} ({o.key})</option>
        ))}
      </select>
      {selected && <p className="text-[10px] text-zinc-400 mt-0.5">{selected.desc}</p>}
    </div>
  );
}
