# Intent: bug_report

## 定義

明確な不具合申告、画面エラー、操作不能など。  
「ボタンを押しても反応しない」「エラー画面が出る」「保存できない」などが該当する。  
計測問題（tracking_issue）やログイン問題（login_account）と区別する。

---

## Required Slots (コードと同期)

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `project_name_or_id` | 対象プロジェクト名または ID | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `occurred_at` | 発生日時または発生した時期 | required |
| `reproduction_steps` | 再現手順 | required |

---

## Ask Priority (聴取優先順位)

1. `symptom` — どんな症状か
2. `reproduction_steps` — どう操作すると起きるか
3. `occurred_at` — いつ頃から
4. `project_name_or_id` — どのプロジェクトか

---

## Handoff Minimum Condition

以下を満たした時点で handoff に切り替える:

- **必須**: `symptom` が埋まっている
- **いずれか**: `reproduction_steps` または `occurred_at` が埋まっている

---

## Escalation 注意点

- 「全く使えない」「全機能が止まっている」など広範囲影響 → 即時 escalation
- 「至急」「緊急」などの高緊急ワード → 即時 escalation
- データ消失・セキュリティ影響の可能性 → 即時 escalation
- 同一バグに複数ユーザーから報告がある場合 → escalation 検討

---

## Bot の質問方向性

- 「何の操作で、何が起きたか」と「いつから」を軸に聞く
- スクリーンショットや画面録画があれば依頼してよい
- ブラウザ・OS 情報は推奨情報として聞いてよい
- 原因・修正時期は断定しない

---

## Skill

| skill 名 | 状態 | 概要 |
|---|---|---|
| `skill_known_bug_match` | **実装済み (Phase 9)** | NocoDB `support_ai_known_issues` の既知バグとキーワードマッチング。信頼度 ≥ 0.70 で採用。 |
| `skill_bug_workaround` | 未実装 | 既知バグの回避策案内 |
| `skill_help_center_bug` | 未実装 | Help Center の不具合関連記事を参照 |
