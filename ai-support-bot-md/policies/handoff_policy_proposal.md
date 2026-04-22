# Policy 改訂提案: handoff_policy (06_handoff_policy.md)

**変更理由:**  
500件分析で判明した課題:
1. usage_guidance の片方スロットでの即 handoff → 担当者への情報引き継ぎが不十分
2. 新設 experience_issue intent を handoff テーブルに追加
3. 解約申請フォーム形式の取り扱い明確化

---

## 変更箇所

### 1. handoff テーブルの変更

**変更前:**

| カテゴリ | 必須 slot | いずれか1つ |
|---|---|---|
| tracking_issue | symptom | occurred_at または target_url |
| report_difference | report_name | compare_target または date_range |
| login_account | account_email_or_user, symptom | — |
| billing_contract | — | contract_target または inquiry_topic |
| bug_report | symptom | reproduction_steps または occurred_at |
| usage_guidance | — | target_feature または user_goal |

**変更後:**

| カテゴリ | 必須 slot | いずれか1つ |
|---|---|---|
| tracking_issue | symptom | occurred_at または target_url |
| report_difference | report_name | compare_target または date_range |
| login_account | account_email_or_user, symptom | — |
| billing_contract（通常） | — | contract_target または inquiry_topic |
| **billing_contract（解約・返金）** | **account_email_or_user, inquiry_topic** | — |
| bug_report | symptom | reproduction_steps または occurred_at |
| usage_guidance | **target_feature, user_goal（両方必須）** | — |
| **experience_issue（新設）** | **experience_name** | **symptom または device_type** |

### 2. usage_guidance handoff ルールの変更

**変更前:**
- 必須なし
- いずれか: `target_feature` または `user_goal` が埋まっている

**変更後:**
- **必須**: `target_feature` + `user_goal` の両方
- **例外**: `skill_help_center_answer` が confidence ≥ 0.65 で回答した場合は handoff 不要（直接回答で完結）

**追加ルール:**
```
usage_guidance の handoff 判定フロー:
1. skill_help_center_answer を実行
2. confidence ≥ 0.65 → 直接回答（handoff しない）
3. confidence < 0.65 → slot 収集続行
4. target_feature + user_goal が揃った → handoff
```

### 3. 解約申請フォーム形式の特別処理

**追加ルール:**
```
billing_contract で以下が成立する場合 → escalation より structured handoff を優先する:
  - inquiry_topic に「解約」が含まれる
  - かつ account_email_or_user が埋まっている（フォームに記載されている）
  - かつ 怒り・強いクレームのシグナルがない

解約クレームのシグナル:
  - 「ずっと放置されている」「何度も言っている」「対応が悪い」「返金してほしい」
  → これらが含まれる場合は escalation を優先
```

### 4. handoff テーブル全体の更新（コードとの対応）

| 概念 | 実装箇所 | 変更内容 |
|---|---|---|
| handoff 最小条件 | `src/lib/handoff-guard.js` `isReadyForHandoff()` | usage_guidance を両方必須に変更、experience_issue を追加 |
| billing_contract 解約特別処理 | `src/lib/handoff-guard.js` | 解約+メールアドレスあり → structured handoff ロジック追加 |
| handoff 判定タイミング | `src/lib/processor.js` Step 9b | 変更なし |
| handoff 文面 | `src/lib/handoff-guard.js` `HANDOFF_REPLY` | 変更なし |

---

## 変更後の該当箇所のみ（差分）

```markdown
## handoff に切り替えるタイミング（変更後）

| カテゴリ | 必須 slot | いずれか1つ |
|---|---|---|
| tracking_issue | symptom | occurred_at または target_url |
| report_difference | report_name | compare_target または date_range |
| login_account | account_email_or_user, symptom | — |
| billing_contract（通常） | — | contract_target または inquiry_topic |
| billing_contract（解約・返金） | account_email_or_user, inquiry_topic | — |
| bug_report | symptom | reproduction_steps または occurred_at |
| usage_guidance | target_feature, user_goal（両方） | — |
| experience_issue | experience_name | symptom または device_type |

## usage_guidance の特別ルール

skill_help_center_answer が confidence ≥ 0.65 で回答した場合は handoff 不要。
直接回答で session を完了してよい。

## 解約申請フォーム形式の特別処理

inquiry_topic に「解約」が含まれ、account_email_or_user が埋まっており、
クレームシグナル（怒り・返金要求・放置への不満）がない場合は、
escalation より structured handoff を優先する。
```
