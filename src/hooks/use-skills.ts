"use client";
import { useState, useEffect } from "react";
import { SKILL_LABELS, SKILL_THRESHOLDS } from "@/lib/workflow-types";

export type SkillInfo = {
  key:         string;
  label:       string;
  description: string;
  threshold:   number;
};

let cache: SkillInfo[] | null = null;
let cachePromise: Promise<SkillInfo[]> | null = null;

async function fetchSkills(): Promise<SkillInfo[]> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = fetch("/api/skills")
      .then(r => r.json())
      .then(d => {
        const list: SkillInfo[] = [];
        // 既存ハードコードを先に追加
        for (const [key, label] of Object.entries(SKILL_LABELS)) {
          list.push({ key, label: label as string, description: "", threshold: SKILL_THRESHOLDS[key] ?? 0.65 });
        }
        // NocoDB から追加（既存と重複しないもの）
        for (const s of (d.list ?? [])) {
          if (!list.find(x => x.key === s.skill_key)) {
            list.push({
              key:         s.skill_key,
              label:       s.label ?? s.skill_key,
              description: s.description ?? "",
              threshold:   s.threshold ?? 0.65,
            });
          }
        }
        cache = list;
        return list;
      })
      .catch(() => {
        // フェッチ失敗時はハードコードのみ返す
        cachePromise = null;
        return Object.entries(SKILL_LABELS).map(([key, label]) => ({
          key, label: label as string, description: "", threshold: SKILL_THRESHOLDS[key] ?? 0.65,
        }));
      });
  }
  return cachePromise;
}

export function useSkills() {
  const [skills, setSkills] = useState<SkillInfo[]>(() =>
    Object.entries(SKILL_LABELS).map(([key, label]) => ({
      key, label: label as string, description: "", threshold: SKILL_THRESHOLDS[key] ?? 0.65,
    }))
  );

  useEffect(() => {
    fetchSkills().then(setSkills);
  }, []);

  const skillLabels:     Record<string, string> = Object.fromEntries(skills.map(s => [s.key, s.label]));
  const skillThresholds: Record<string, number> = Object.fromEntries(skills.map(s => [s.key, s.threshold]));

  return { skills, skillLabels, skillThresholds };
}
