# Intent 改訂提案: billing_contract

**変更理由:**  
500件分析で billing_contract は全体の15.2%（76件）。  
解約申請が13件確認され、フォーム形式での申請が多い（定型化されている）。  
解約・返金時に担当者が最初に必要な情報はアカウントのメールアドレスだが、現行 slots に含まれていない。  
また「解約申請フォーム形式」の問い合わせは即時 escalation より structured handoff の方が担当者の対応効率が高い。

---

## 変更箇所

### 1. Required Slots に `account_email_or_user` を条件付き必須で追加

| slot 名 | 説明 | 必須度 | 変更 |
|---|---|---|---|
| `contract_target` | 対象の契約・プラン名 | required | 変更なし |
| `inquiry_topic` | 問い合わせの具体的な内容 | required | 変更なし |
| `target_period` | 対象の請求月・契約期間 | required | 変更なし |
| `account_email_or_user` | 契約メールアドレスまたはアカウント名 | **条件付き required** | **新規追加** |
| `cancellation_reason` | 解約理由 | optional | **新規追加** |

**`account_email_or_user` が必須になる条件:**  
`inquiry_topic` に「解約」「返金」「違約」が含まれる場合

**`cancellation_reason` の収集方針:**  
解約が確定した場合のみ optional で収集。競合情報・利用終了理由として価値がある。強制しない。

### 2. Ask Priority の変更

**変更前:**
1. `contract_target`
2. `inquiry_topic`
3. `target_period`

**変更後（解約・返金時）:**
1. `account_email_or_user` — 契約を特定するため最優先
2. `inquiry_topic` — 具体的な意向
3. `contract_target` — プラン名
4. `cancellation_reason` — 任意

**変更後（請求・プラン変更時）:**
1. `contract_target` — どの契約・プランか
2. `inquiry_topic` — 何を知りたいか
3. `target_period` — 対象期間

### 3. Handoff Minimum Condition の変更

**変更前:**
- 必須なし
- いずれか: `contract_target` または `inquiry_topic`

**変更後:**
- 解約・返金の場合: **`account_email_or_user` + `inquiry_topic` の両方が必須**
- その他（プラン変更・請求確認等）: `contract_target` または `inquiry_topic` どちらか（現行維持）

### 4. Escalation 注意点の精緻化

**変更前:** 「解約」「返金」の示唆 → 即時 escalation

**変更後:**
- 「解約申請フォーム形式（メールアドレス・プロジェクト名が含まれる）」→ **structured handoff 優先**（escalation 不要）
- 「解約に関してクレームや強い不満を伴う場合」→ 従来通り即時 escalation
- 「返金要求」→ 即時 escalation（現行維持）

**理由:** 解約申請の大半は定型的な申請であり、怒りや不満を伴わない。フォーム形式の解約申請を escalation するのは担当者にとっても対応しにくい。

---

## PV上限・プラン機能差（`billing_contract[pv_limit]`）について

分析で3〜22件程度の「PV上限・プラン機能差」系問い合わせが確認された。  
これらは契約変更を伴わないケースも多く、Help Center / FAQ で対応可能。  
現行の billing_contract に含めるが、将来的に `plan_quota` として分離することを推奨。

**今回は分離しない（次フェーズで検討）**

---

## 変更後の全文（参考）

```markdown
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

---

## Ask Priority（解約・返金の場合）

1. `account_email_or_user` — 契約を特定するため最優先
2. `inquiry_topic` — 具体的な意向（解約日・返金理由等）
3. `contract_target` — プラン名
4. `cancellation_reason` — 任意（「差し支えなければ解約の理由をお聞かせいただけますか」）

## Ask Priority（その他請求・プラン変更の場合）

1. `contract_target`
2. `inquiry_topic`
3. `target_period`

---

## Handoff Minimum Condition

- **解約・返金の場合**: `account_email_or_user` + `inquiry_topic` の両方が必須
- **その他の場合**: `contract_target` または `inquiry_topic` どちらか

---

## Escalation 注意点

- **解約申請フォーム形式（メールアドレス・プロジェクト名を含む定型申請）→ escalation より structured handoff 優先**
- 「解約・返金に強い不満・クレームを伴う場合」→ 即時 escalation
- 返金要求 → 即時 escalation
- 法的・契約上の補償 → 即時 escalation
- 請求金額の大幅差異・重複請求 → escalation 検討
```
