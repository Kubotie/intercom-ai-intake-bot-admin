# Intent: billing_contract

## 定義

請求、契約、プラン、更新、利用範囲、解約などの問い合わせ。
「解約したい」「請求書の金額が違う」「プランを変えたい」「契約の更新タイミングを知りたい」「PV上限を超えた」などが該当する。

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `contract_target` | 対象の契約・プラン名 | required |
| `inquiry_topic` | 問い合わせの具体的な内容（解約・返金・プラン変更など） | required |
| `target_period` | 対象の請求月・契約期間 | required |
| `account_email_or_user` | 契約メールアドレスまたはアカウント（解約・返金時のみ必須） | conditional required |
| `cancellation_reason` | 解約理由（解約時のみ任意収集） | optional |

### `account_email_or_user` が必須になる条件

`inquiry_topic` に「解約」「返金」「違約」「退会」「キャンセル」が含まれる場合。
担当者が契約を特定するために最初に必要な情報。

### `cancellation_reason` の収集方針

解約が確定した場合のみ optional で収集。
「差し支えなければ解約の理由をお聞かせいただけますか」と穏やかに聞く。強制しない。

---

## Ask Priority（解約・返金の場合）

1. `account_email_or_user` — 契約を特定するため最優先
2. `inquiry_topic` — 具体的な意向（解約日・希望等）
3. `contract_target` — プラン名
4. `cancellation_reason` — 任意（穏やかに）

## Ask Priority（その他・請求・プラン変更の場合）

1. `contract_target` — どの契約・プランか
2. `inquiry_topic` — 何を知りたいか
3. `target_period` — 対象期間

---

## Handoff Minimum Condition

- **解約・返金の場合**: `account_email_or_user` + `inquiry_topic` の両方が必須
- **その他（プラン変更・請求確認等）**: `contract_target` または `inquiry_topic` どちらか

解約・返金は担当者が最初にメールアドレスで契約を特定する必要があるため、早期 handoff より情報収集を優先する。

---

## Escalation 注意点

- **解約申請フォーム形式（メールアドレス・プロジェクト名を含む定型申請）→ escalation より structured handoff 優先**
- 「解約に強い不満・クレームを伴う場合（ずっと放置、対応が悪い、何度も言っている）」→ 即時 escalation
- 返金要求 → 即時 escalation（現行維持）
- 法的・契約上の補償 → 即時 escalation
- 請求金額の大幅差異・重複請求 → escalation 検討

---

## Bot の質問方向性

- 解約系は「メールアドレスを確認させてください」を最初の質問にする
- 「どの契約について、何を確認したいか」を軸に聞く
- 請求の正誤判断は Bot では行わない
- プラン詳細・料金は断定せず担当者確認を促す
- 契約変更・解約の申請手順は担当者に任せる
- PV上限の確認は Help Center / FAQ で対応可能な場合がある

---

## 将来の Skill 候補

| skill 名 | 概要 |
|---|---|
| `skill_plan_info` | プラン詳細・価格表・PV上限の参照 |
| `skill_billing_faq` | よくある請求の質問への回答ガイド |
| `skill_contract_change_flow` | 契約変更手順の案内（human 承認必須） |
