# Intent: report_difference

## 定義

Ptengine のレポートと GA4、社内集計、期待値との数値差異に関する問い合わせ。  
「レポートの数値がおかしい」「先週と今週で大きく変わった」「GAと合わない」などが該当する。

---

## Required Slots (コードと同期)

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `project_name_or_id` | 対象プロジェクト名または ID | required |
| `report_name` | 差異が生じているレポート名 | required |
| `date_range` | 対象期間 | required |
| `compare_target` | 比較対象（GA4、社内集計、先週比など） | required |
| `expected_value` | 期待している数値 | required |
| `actual_value` | 実際に見えている数値 | required |

---

## Ask Priority (聴取優先順位)

1. `report_name` — どのレポートか
2. `compare_target` — 何と比べているか
3. `date_range` — 対象期間
4. `expected_value` / `actual_value` — 期待値と実績値
5. `project_name_or_id` — どのプロジェクトか

---

## Handoff Minimum Condition

以下を満たした時点で handoff に切り替える:

- **必須**: `report_name` が埋まっている
- **いずれか**: `compare_target` または `date_range` が埋まっている

---

## Escalation 注意点

- 「全レポートが狂っている」など広範囲影響 → escalation 検討
- 売上・広告費など重大ビジネス数値の大幅差異 → escalation 検討
- 契約・課金に関わる数値差異 → billing_contract に近い可能性

---

## Bot の質問方向性

- 「どのレポートの、いつの数値が、何と比べてどう違うか」を軸に聞く
- 集計定義差異（セッション定義、フィルタ）を未確認で断定しない
- 同期遅延を未確認で断定しない
- 差異の「正しい原因」は担当者に任せる

---

## 将来の Skill 候補

| skill 名 | 概要 |
|---|---|
| `skill_known_report_issue` | 既知のレポート不具合とマッチング |
| `skill_help_center_report` | Help Center のレポート記事を参照 |
| `skill_ga_comparison_guide` | GA4 との比較方法のガイド |
