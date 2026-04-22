# Skill Framework — README

更新日: 2026-04-22

## 概要

Bot の回答ロジックをモジュール化した Skill Orchestration Framework の定義。
orchestrator が intent に対応する skill を順に試し、最初に採用できた結果を使う。

---

## Knowledge Connection Framework との関係

```
顧客メッセージ
   ↓
processor.js — intent 分類 / slot 収集
   ↓
Skill Orchestrator (orchestrator.js)
   ↓ intent に対応する skill を順に実行
   ├── help_center_answer  → Help Center 検索 + LLM 回答
   ├── faq_answer          → Notion FAQ 検索 + LLM 回答
   └── known_bug_match     → 既知バグ DB 照合
   ↓
policy-gate.js — 顧客返答可否チェック
   ↓
reply-resolver.js — 最終 reply 文面決定
```

---

## intent 別の参照優先順

**FAQ と Help Center は両方参照するが、intent によって試す順序が異なる。**

### usage_guidance (使い方・設定方法)

```
1. help_center_answer  ← HC が how-to に強い
2. faq_answer          ← FAQ は補完 (トラブルシュートが中心)
```

理由: FAQ に how-to コンテンツはなく、使い方・設定手順は Help Center が適切。

### experience_issue (体験・ヒートマップ・表示問題)

```
1. faq_answer          ← FAQ がトラブルシューティング37件で強い
2. help_center_answer  ← HC は fallback
```

理由: FAQ の87件は全てトラブルシューティング型。「表示されない」「反映されない」系は FAQ が特化している。

---

## Skill 一覧

### 公開ナレッジ回答

| skill 名 | 対象 intent | source | 優先順 |
|---|---|---|---|
| `help_center_answer` | usage_guidance | Ptengine Help Center | usage_guidance で 1番目 |
| `faq_answer` | usage_guidance | Notion FAQ (knowledge_chunks) | usage_guidance で 2番目 |
| `faq_answer` | experience_issue | Notion FAQ (knowledge_chunks) | experience_issue で **1番目** |
| `help_center_answer` | experience_issue | Ptengine Help Center | experience_issue で 2番目 |

### 既知バグ照合

| skill 名 | 対象 intent | source | 状態 |
|---|---|---|---|
| `known_bug_match` | bug_report | support_ai_known_issues | **実装済み** |

---

## Skill Registry (`src/lib/skills/registry.js`)

```
usage_guidance:   [help_center_answer, faq_answer]   ← HC first (how-to)
experience_issue: [faq_answer, help_center_answer]   ← FAQ first (troubleshooting)
bug_report:       [known_bug_match]
tracking_issue:   []  (将来追加)
report_difference: []
login_account:    []
billing_contract: []
```

**実行順 = 優先順位**: orchestrator は先頭から試して最初に採用した結果を返す。

---

## 採用判定 (`shouldUseSkillResult`)

| rejection_reason | 意味 |
|---|---|
| `not_handled` | skill.handled=false (候補なし・検索失敗) |
| `missing_answer_type` | answer_type が null |
| `empty_answer_message` | answer_message が null または空 |
| `confidence_below_threshold` | confidence が threshold 未満 (閾値: 0.65) |
| `exception` | skill の run() が例外を throw |

---

## Source Policy Gate (`src/lib/knowledge/policy-gate.js`)

| source_type | 顧客返答可 | 条件 |
|---|---|---|
| `help_center` | ✅ 常に可 | — |
| `notion_faq` | ✅ 条件付き | published_to_bot=true のみ |
| `known_issue` | ✅ 条件付き | published_to_bot=true のみ |
| `notion_cse` | ❌ 不可 | 内部補助のみ（変更不可） |

---

## Observability

実会話確認で見るべきフィールド:

| フィールド | 場所 | 内容 |
|---|---|---|
| `selected_skill` | `answer_candidate_json` / ログ | 採用された skill 名 (null=不採用) |
| `reply_source_candidate` | `answer_candidate_json` | help_center_answer / faq_answer / handoff / next_message |
| `retrieval_query` | `answer_candidate_json` | 実際に検索に使ったクエリ |
| `candidate_titles` | `answer_candidate_json` | 検索でヒットした記事/FAQ タイトル一覧 |
| `candidate_chunk_ids` | `answer_candidate_json` | ヒットした notion_faq の chunk_id (faq_answer のみ) |
| `confidence` | `answer_candidate_json` | LLM が付けた確信度 |
| `reason` | `answer_candidate_json` / ログ | 採用/不採用の理由 |
| `skill_candidates[]` | `answer_candidate_json.skill_candidates` | 全 skill の試行結果と `answer_candidate_json` |

### ログで確認する流れ

```
[knowledge skill evaluation started]
  → category, filled_slots, handoff_deferred

[skill candidate selected] (skill ごとに1回)
  → skill_name

[skill executed]
  → handled, confidence, answer_type, answer_candidate_json

[skill result accepted / rejected]
  → rejection_reason, answer_candidate_json

[knowledge skill evaluation finished]
  → selected_skill, reply_source, skill_handled
```

---

## CSE の扱い (内部補助のみ)

`notion_cse` (CSE 対応事例) は **顧客回答には絶対に使わない**。
CSE をどの skill の `allowedSourceTypes` にも含めてはいけない。

---

## FAQ が存在しない領域での動作

| クエリタイプ | FAQ | 動作 |
|---|---|---|
| 「セグメントの使い方」 | FAQ なし | faq_answer: no candidates → rejected → HC へ fallback |
| 「ポップアップが表示されない」 | FAQ あり (4件) | faq_answer: candidates → LLM → confidence ≥ 0.65 → adopted |
| 「ヒートマップの見方」(how-to) | FAQ なし | HC first → FAQ fallback |
| 「体験が反映されない」 | FAQ あり (36件) | faq_answer first → adopted |
