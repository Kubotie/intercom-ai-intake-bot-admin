// Parsed sandbox result used for workflow highlighting

export type SkillAttempt = {
  skillName: string;
  accepted: boolean;
  confidence: number;
  rejectionReason: string | null;
};

export type RegistryDebug = {
  skillsTableConfigured: boolean;
  loadedSkillKeys: string[];
  registeredForCategory: string[];
  initError: string | null;
};

export type WorkflowRunResult = {
  message: string;
  conciergeKey: string | null;
  conciergeName: string | null;
  conciergeSource: string | null;
  category: string | null;
  selectedSkill: string | null;
  triedSkills: SkillAttempt[];
  replySource: string;
  isHandoff: boolean;
  isEscalation: boolean;
  decisionTrace: string;
  executionProfile: {
    policyKey: string;
    skillKey: string;
    sourceKey: string;
  } | null;
  replyCandidate: string | null;
  classifyReason: string | null;
  registryDebug: RegistryDebug | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSandboxResult(raw: any, message: string): WorkflowRunResult {
  const skillCandidates: SkillAttempt[] = (
    raw.answer_candidate_json?.skill_candidates ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((s: any) => ({
    skillName:       s.skill_name,
    accepted:        Boolean(s.accepted),
    confidence:      s.confidence ?? 0,
    rejectionReason: s.rejection_reason ?? null,
  }));

  return {
    message,
    conciergeKey:    raw.concierge?.key ?? null,
    conciergeName:   raw.concierge?.name ?? null,
    conciergeSource: raw.concierge?.source ?? null,
    category:        raw.category ?? null,
    selectedSkill:   raw.selected_skill ?? null,
    triedSkills:     skillCandidates,
    replySource:     raw.reply_source ?? "fallback",
    isHandoff:       raw.status === "ready_for_handoff",
    isEscalation:    Boolean(raw.should_escalate),
    decisionTrace:   raw.decision_trace ?? "",
    executionProfile: raw.execution_profile
      ? {
          policyKey: raw.execution_profile.policy_profile_key,
          skillKey:  raw.execution_profile.skill_profile_key,
          sourceKey: raw.execution_profile.source_priority_profile_key,
        }
      : null,
    replyCandidate: raw.reply_candidate ?? null,
    classifyReason: raw.classify_reason ?? null,
    registryDebug: raw.registry_debug
      ? {
          skillsTableConfigured: Boolean(raw.registry_debug.skills_table_configured),
          loadedSkillKeys:       raw.registry_debug.loaded_skill_keys ?? [],
          registeredForCategory: raw.registry_debug.registered_for_category ?? [],
          initError:             raw.registry_debug.init_error ?? null,
        }
      : null,
  };
}
