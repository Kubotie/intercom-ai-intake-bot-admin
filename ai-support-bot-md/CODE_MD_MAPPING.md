# コードと md 定義の対応表

> **現時点の位置づけ:**  
> - コード (`src/lib/`) = **実行系 (execution layer)** — Bot が実際に動く根拠
> - md (`ai-support-bot-md/`) = **運用定義層 (definition layer)** — 人が読む仕様書
>
> 現フェーズでは「コードが source of truth」。将来的に md が source of truth に近づいていく。

---

## Knowledge Connection Framework との対応

| コード | md | 備考 |
|---|---|---|
| `src/lib/knowledge/policy-gate.js` `canExposeKnowledgeToCustomer()` | `knowledge/sources/*.md` Policy Gate 欄 | source 別の顧客返答可否判定 |
| `src/lib/knowledge/policy-gate.js` `filterExposableChunks()` | `skills/README.md` Source Policy Gate | chunks 配列のフィルタ |
| `src/lib/knowledge/source-registry.js` `listActiveSources()` | `knowledge/sources/*.md` | NocoDB knowledge_sources テーブルのラッパー |
| `src/lib/knowledge/chunks.js` `searchChunks()` | `skills/README.md` knowledge_chunks テーブル | 将来 Notion FAQ / CSE の検索対象 |
| `src/lib/knowledge/retrieval.js` `retrieveKnowledgeCandidates()` | `skills/README.md` Retrieval Interface | 統一検索 interface |
| `src/lib/knowledge/retrieval.js` `filterExposable()` | `knowledge/policies/source_priority.md` | 顧客返答可フィルタ |
| `src/lib/skills/faq-answer.js` `runFaqAnswerSkill()` | `knowledge/sources/notion_faq_db.md` | Notion FAQ skill (skeleton) |
| `src/lib/skills/help-center-answer.js` (experience_issue 対応) | `knowledge/sources/help_center.md` | usage_guidance + experience_issue |
| `src/lib/knowledge/notion-client.js` `queryDatabase()` | `knowledge/sources/notion_faq_db.md` | Notion API native fetch クライアント |
| `src/lib/knowledge/sync-notion-faq.js` `syncNotionFaq()` | `knowledge/sources/notion_faq_db.md` Sync Rule | Notion FAQ → NocoDB chunks 同期 |
| `src/scripts/setup-knowledge-chunks-table.js` | `knowledge/sources/*.md` 推奨テーブル構成 | NocoDB にチャンクテーブルを作成するセットアップ |
| `src/scripts/sync-notion-faq.js` | `knowledge/sources/notion_faq_db.md` | sync job の CLI エントリポイント |

---

## カテゴリ / Intent の対応

| コード定義 | md 定義 | 備考 |
|---|---|---|
| `src/lib/categories.js` `CATEGORY_LIST` | `ai-support-bot-md/intents/*.md` | 各 intent ファイル = 1 カテゴリ |
| `categories/tracking_issue.md` (旧) | `intents/tracking_issue.md` (新) | intents/ が拡充版 |
| `categories/report_difference.md` (旧) | `intents/report_difference.md` (新) | intents/ が拡充版 |
| `categories/login_account.md` (旧) | `intents/login_account.md` (新) | intents/ が拡充版 |
| `categories/billing_contract.md` (旧) | `intents/billing_contract.md` (新) | intents/ が拡充版 |
| `categories/bug_report.md` (旧) | `intents/bug_report.md` (新) | intents/ が拡充版 |
| `categories/usage_guidance.md` (旧) | `intents/usage_guidance.md` (新) | intents/ が拡充版 |
| (新規) | `intents/experience_issue.md` (新) | 実履歴分析で新設 (約24%) |

---

## Required Slots の対応

| コード | md | 値の一致 |
|---|---|---|
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.tracking_issue` | `intents/tracking_issue.md` Required Slots | ✅ 一致 |
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.report_difference` | `intents/report_difference.md` Required Slots | ✅ 一致 |
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.login_account` | `intents/login_account.md` Required Slots | ✅ 一致 |
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.billing_contract` | `intents/billing_contract.md` Required Slots | ✅ 一致 |
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.bug_report` | `intents/bug_report.md` Required Slots | ✅ 一致 |
| `categories.js` `REQUIRED_SLOTS_BY_CATEGORY.usage_guidance` | `intents/usage_guidance.md` Required Slots | ✅ 一致 |

---

## Ask Priority (聴取順) の対応

| コード | md |
|---|---|
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.tracking_issue` | `intents/tracking_issue.md` Ask Priority |
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.report_difference` | `intents/report_difference.md` Ask Priority |
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.login_account` | `intents/login_account.md` Ask Priority |
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.billing_contract` | `intents/billing_contract.md` Ask Priority |
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.bug_report` | `intents/bug_report.md` Ask Priority |
| `categories.js` `SLOT_PRIORITY_BY_CATEGORY.usage_guidance` | `intents/usage_guidance.md` Ask Priority |

---

## Handoff Minimum Condition の対応

| コード | md |
|---|---|
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.tracking_issue` | `intents/tracking_issue.md` Handoff Minimum Condition |
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.report_difference` | `intents/report_difference.md` Handoff Minimum Condition |
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.login_account` | `intents/login_account.md` Handoff Minimum Condition |
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.billing_contract` | `intents/billing_contract.md` Handoff Minimum Condition |
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.bug_report` | `intents/bug_report.md` Handoff Minimum Condition |
| `handoff-guard.js` `HANDOFF_MIN_CONDITION_BY_CATEGORY.usage_guidance` | `intents/usage_guidance.md` Handoff Minimum Condition |

---

## Escalation Keywords の対応

| コード | md |
|---|---|
| `processor.js` `ESCALATION_KEYWORDS` = `["至急", "緊急", "全く使えない", "障害", "返金", "解約"]` | `policies/03_escalation_policy.md` 即時エスカレーション条件 |

---

## Tone / Behavior の対応

| コード定義 | md 定義 |
|---|---|
| `processor.js` 1返信最大2質問制限 (`askSlots.slice(0, 2)`) | `policies/01_global_behavior.md` 「1回の返信で質問は最大2つまで」 |
| `reply-resolver.js` FALLBACK_REPLY | `policies/01_global_behavior.md` 受領文 |
| `reply-resolver.js` ESCALATION_REPLY | `policies/03_escalation_policy.md` エスカレーション時の動作 |
| `reply-resolver.js` HANDOFF_REPLY | `policies/06_handoff_policy.md` handoff 文面の方針 |
| `handoff-guard.js` `isReadyForHandoff()` | `policies/06_handoff_policy.md` handoff に切り替えるタイミング |

---

## Prompt との対応

| コード | md |
|---|---|
| `llm.js` `classifyCategory()` | `prompts/classifier_prompt.md` |
| `llm.js` `extractSlots()` | `prompts/slot_extractor_prompt.md` |
| `llm.js` `generateNextQuestion()` | `prompts/next_question_prompt.md` |

---

## Skill Orchestration Framework との対応

| コード | md |
|---|---|
| `src/lib/skills/registry.js` `SKILL_REGISTRY` | `skills/README.md` Skill Registry |
| `src/lib/skills/orchestrator.js` `runSkillOrchestration()` | `skills/README.md` Orchestrator |
| `src/lib/skills/orchestrator.js` `shouldUseSkillResult()` | `skills/README.md` 採用判定 |
| `src/lib/skills/help-center-answer.js` `runHelpCenterAnswerSkill()` | `skills/README.md` 実装済み Skill |
| `src/lib/skills/help-center-answer.js` `searchHelpCenter()` | `knowledge/sources/help_center.md` |
| `src/lib/skills/help-center-answer.js` `CONFIDENCE_THRESHOLD = 0.65` | `skills/README.md` 信頼度閾値 (registry.js で参照) |
| `src/lib/skills/known-bug-match.js` `runKnownBugMatchSkill()` | `skills/README.md` skill_known_bug_match |
| `src/lib/skills/known-bug-match.js` `computeKeywordScore()` | `skills/README.md` キーワード一致率算出 |
| `src/lib/skills/known-bug-match.js` `CONFIDENCE_THRESHOLD = 0.70` | `skills/README.md` 信頼度閾値 |
| `processor.js` Step 9.5 `runSkillOrchestration()` 呼び出し | `skills/README.md` Orchestrator フロー |
| `reply-resolver.js` `SKILL_ANSWER_TYPES` Set | `skills/README.md` reply 優先順位 (skill 回答汎用判定) |

---

## Observability (Phase 8-10) との対応

| コード | md |
|---|---|
| `orchestrator.js` `shouldUseSkillResult()` → `{ accepted, rejection_reason }` | `skills/README.md` 採用判定 / rejection_reason コード一覧 |
| `orchestrator.js` `runSkillOrchestration()` → `candidate_results[]` | `skills/README.md` Observability / skill_candidates |
| `handoff-guard.js` `resolveHandoffReason()` | `skills/README.md` handoff/escalation の reason 文字列 |
| `processor.js` `resolveEscalationReason()` | `skills/README.md` handoff/escalation の reason 文字列 |
| `processor.js` `buildDecisionTrace()` | `skills/README.md` Observability / decision_trace |
| `processor.js` `answer_candidate_json` (拡張フィールド) | `skills/README.md` answer_candidate_json の拡張フィールド |
| `processor.js` `final_summary_json` / `updateSession` | `skills/README.md` final_summary_json |
| `src/lib/handoff-summary.js` `buildHandoffSummary()` | `skills/README.md` Handoff Summary |
| `src/lib/handoff-summary.js` `buildTemplateHandoffSummary()` | `skills/README.md` Handoff Summary (template fallback) |
| `processor.js` `needsHandoffSummary` / `handoffSummaryFields` | `skills/README.md` Handoff Summary 生成タイミング |
| `processor.js` ログ: `reply resolution trace` など | `skills/README.md` Vercel Logs での確認キーワード |
| `nocodb-mapper.js` `buildSessionObservabilityFields()` | `skills/README.md` 個別フィールド同期 / `README_JA.md` 個別フィールド一覧 |
| `nocodb-mapper.js` `buildSessionUpdate({ observabilityFields })` | `skills/README.md` 個別フィールド同期 |
| `processor.js` `obsFields` / `session observability fields persisted` ログ | `README_JA.md` Vercel Logs での確認キーワード |

---

## 将来の移行方針

現フェーズ（コードが source of truth）:
```
categories.js  →  コードに直接定義
handoff-guard.js  →  コードに直接定義
processor.js  →  コードに直接定義
```

将来フェーズ（md が source of truth）:
```
intents/*.md  →  コードが読み込んで動的に使う
policies/*.md  →  LLM の system prompt として渡す
skills/*.md  →  Skill の起動条件として解釈する
knowledge/sources/*.md  →  知識ソースの参照先として使う
```

**移行順の推奨:**
1. `intents/*.md` の handoff condition → `handoff-guard.js` の動的読み込み
2. `policies/*.md` → LLM system prompt への組み込み
3. `skills/` → 実装開始
4. `knowledge/` → 同期ジョブ実装
