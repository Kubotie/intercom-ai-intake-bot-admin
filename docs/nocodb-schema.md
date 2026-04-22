# NocoDB スキーマ定義書

Admin Console / Bot Runtime が前提とする NocoDB テーブル定義。
**このドキュメントの通りにカラムを作成してください。**

---

## テーブル一覧

| テーブル名 | env 変数 | テーブル ID | 役割 |
|-----------|---------|------------|------|
| `support_ai_sessions` | `NOCODB_SESSIONS_TABLE_ID` | `me9i0h2953mqxhp` | セッションごとの AI 判断・状態管理 |
| `support_ai_messages` | `NOCODB_MESSAGES_TABLE_ID` | `m2ki36ul3559pwt` | ユーザー/Bot メッセージ履歴 |
| `support_ai_slots` | `NOCODB_SLOTS_TABLE_ID` | `muxqqlwfay9vnwp` | slot 収集（情報ヒアリング） |
| `support_ai_knowledge_chunks` | `NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID` | `me7r24il0sz8sn7` | FAQ / Help Center チャンク |
| `support_ai_known_issues` | `NOCODB_KNOWN_ISSUES_TABLE_ID` | `mz9ilj4f5v3czka` | 既知バグ・既知問題リスト |
| `support_ai_knowledge_sources` | `NOCODB_KNOWLEDGE_SOURCES_TABLE_ID` | `mr6w8m6wdomb6vf` | 同期ソース管理・最終同期日時 |
| `support_ai_concierges` | `NOCODB_CONCIERGES_TABLE_ID` | `mcg9gyoxeoik8c3` | コンシェルジュ設定管理 |
| `support_ai_test_targets` | `NOCODB_TEST_TARGETS_TABLE_ID` | `mezi75wt22e03v6` | Bot 返信許可テスト対象 |
| `support_ai_rollout_rules` | `NOCODB_ROLLOUT_RULES_ID` | `mncoox6ol6eunqb` | 本番展開ルール（将来用途） |

---

## 1. support_ai_sessions（最重要）

Bot がセッションを管理するコアテーブル。

### 基本識別子

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `session_uid` | Single line text | ◎ | 形式: `sess_{conversation_id}` |
| `intercom_conversation_id` | Single line text | ◎ | Bot が findSession のキーとして使う |
| `intercom_contact_id` | Single line text | | Intercom の contact ID |
| `latest_user_message` | Long text | | 最新のユーザー発話 |

### AI 判断フィールド

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `status` | Single select | ◎ | 選択肢: `collecting` / `ready_to_answer` / `answered` / `escalated` / `closed` / `handed_off` |
| `category` | Single select | | 選択肢: `experience_issue` / `usage_guidance` / `bug_report` / `tracking_issue` / `billing_contract` / `login_account` / `report_difference` |
| `selected_skill` | Single line text | | 使用されたスキル名 |
| `reply_source` | Single select | | 選択肢: `faq_answer` / `help_center_answer` / `known_bug_match` / `next_message` / `handoff` / `escalation` / `fallback` / `already_handed_off` |
| `handoff_reason` | Long text | | Handoff の理由 |
| `escalation_reason` | Long text | | Escalation の理由 |
| `should_escalate` | Checkbox | | Bot がエスカレーション推奨と判断した場合 true |
| `decision_trace` | Long text | | Bot の判断ログ（デバッグ用） |
| `answer_candidate_json` | Long text | | AI 判断詳細 JSON（confidence / retrieval_query 等を含む） |

### Slot 管理

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `filled_slots_count` | Number | | 収集済み slot 数 |
| `missing_slots_count` | Number | | 未収集 slot 数 |

### サマリ・返信

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `customer_intent_summary` | Long text | | 顧客の意図サマリ |
| `recommended_next_step` | Long text | | 推奨ネクストアクション |
| `reply_preview` | Long text | | Bot 返信本文（最後のターン） |
| `final_summary_json` | Long text | | Handoff 時の summary JSON |

### 評価フィールド（M1 で追加）

| カラム名 | 型 | 必須 | 選択肢 / 補足 |
|---------|-----|:----:|--------------|
| `evaluation` | **Single Select** | | `good` / `bad`（空欄許容） |
| `eval_reason` | Long text | | タグキー + 任意コメント |

> ⚠️ `evaluation` は必ず **Single Select** 型にすること。Text 型だと `(evaluation,blank,true)` フィルタが機能しない。

---

## 2. support_ai_messages

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `session_uid` | Single line text | ◎ | sessions テーブルとの結合キー |
| `role` | Single line text | ◎ | `user` / `bot` |
| `message_text` | Long text | | 発話テキスト |
| `message_order` | Number | ◎ | 会話内の順番（0始まり）|
| `topic` | Single line text | | 会話のトピック（任意） |
| `intercom_message_id` | Single line text | | Intercom メッセージ ID（重複防止に使用） |

---

## 3. support_ai_slots

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `session_uid` | Single line text | ◎ | sessions テーブルとの結合キー |
| `slot_key` | Single line text | ◎ | slot の識別子（例: `error_message`） |
| `slot_value` | Long text | | 収集された値 |
| `is_filled` | Checkbox | | 収集完了フラグ |
| `source_message_id` | Single line text | | どのメッセージで収集したか |

---

## 4. support_ai_knowledge_chunks

Bot の FAQ 回答・Help Center 回答に使用するナレッジ本体。

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `chunk_id` | Single line text | ◎ | 一意キー（例: `notion_faq_{pageId}`） |
| `source_type` | Single line text | ◎ | `notion_faq` / `help_center` / `known_issue` / `notion_cse` |
| `source_name` | Single line text | ◎ | 表示名 |
| `title` | Single line text | ◎ | チャンクタイトル |
| `body` | Long text | | 本文 |
| `tags` | Long text | | タグ（JSON 配列） |
| `url` | Single line text | | 元ページ URL |
| `published_to_bot` | Checkbox | ◎ | false = Bot が参照しない |
| `is_active` | Checkbox | ◎ | false = 無効化済み |
| `updated_at` | DateTime | | Notion 等の最終更新日時 |
| `origin_record_id` | Single line text | | Notion page ID 等 |
| `reusable` | Checkbox | | 複数 intent で再利用可能か |
| `freshness_score` | Decimal | | 鮮度スコア（0.0〜1.0） |

---

## 5. support_ai_known_issues

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `issue_key` | Single line text | ◎ | 一意キー |
| `title` | Single line text | ◎ | |
| `matching_keywords` | Long text | | マッチキーワード（カンマ区切り） |
| `customer_safe_message` | Long text | | Bot が送信する文面 |
| `status` | Single line text | | `active` / `resolved` |
| `published_to_bot` | Checkbox | ◎ | false = Bot が参照しない |

---

## 6. support_ai_knowledge_sources

Notion FAQ / Help Center 等の同期ソース管理テーブル。
Bot の `sync-notion-faq.js` が同期実行時に自動書き込みする。

### 必須カラム

| カラム名 | 型 | 必須 | デフォルト | 補足 |
|---------|-----|:----:|----------|------|
| `source_key` | Single line text | ◎ | — | 一意識別子（例: `notion_faq`）|
| `source_name` | Single line text | ◎ | — | 表示名（例: `Notion FAQ`） |
| `source_type` | Single line text | ◎ | — | Bot 内部キー（`source_key` と同値でよい） |

### 推奨カラム

| カラム名 | 型 | デフォルト | Admin Console での使用箇所 | 補足 |
|---------|-----|----------|--------------------------|------|
| `description` | Long text | — | — | ソースの説明 |
| `source_url_or_path` | Single line text | — | — | Bot が `notion:{DATABASE_ID}` 形式で書き込む |
| `is_active` | Checkbox | `true` | /knowledge ソース表示 | false = Bot がこのソースを無視 |
| `sync_enabled` | Checkbox | `true` | /knowledge カードの「同期無効」表示 | false = Cron がスキップ |
| `freshness_status` | Single line text | — | /knowledge カードの色 | Bot が `fresh` / `stale` を書き込む |
| `last_synced_at` | DateTime | — | /knowledge カード + /overview Last Sync | Bot が同期完了時に書き込む |
| `chunk_count` | Number | — | （将来: /knowledge カード） | 将来 Cron が書き込む、現状は live query で代替 |
| `published_chunk_count` | Number | — | （将来） | 将来 Cron が書き込む |
| `notes` | Long text | — | — | 運用メモ |

### Bot が書き込むフィールド（互換性注意）

Bot の `ensureSourceRegistered()` は以下フィールドを書き込む:
- 新規作成時: `source_name`, `source_type`, `source_url_or_path`, `is_active`, `freshness_status`, `last_synced_at`
- 更新時: `last_synced_at`, `freshness_status`

これらのカラム名を変更してはいけない。

---

## 7. support_ai_concierges

サポート Bot のキャラクター（コンシェルジュ）設定を管理するテーブル。
Admin Console の `/concierges` ページから CRUD 操作する。

### 必須カラム

| カラム名 | 型 | 必須 | デフォルト | Admin Console での使用箇所 |
|---------|-----|:----:|----------|--------------------------|
| `concierge_key` | Single line text | ◎ | — | 一意識別子（例: `ptengine_support`） |
| `display_name` | Single line text | ◎ | — | 一覧の表示名 |
| `is_active` | Checkbox | ◎ | `true` | 有効化/無効化ボタン + /overview カード |
| `is_main` | Checkbox | ◎ | `false` | メインフラグ（削除・無効化ボタンを非表示） |

### 推奨カラム

| カラム名 | 型 | デフォルト | Admin Console での使用箇所 | 補足 |
|---------|-----|----------|--------------------------|------|
| `description` | Long text | — | 一覧の説明欄 | 用途・特徴の説明 |
| `persona_label` | Single line text | — | 一覧の `[ペルソナ]` 表示 | 例: `丁寧・保守的` |
| `intercom_admin_id` | Single line text | — | 一覧の Intercom Admin ID 欄 | 数値 ID（例: `7654321`）|
| `policy_set_key` | Single line text | — | 一覧の Policy Set 欄 | 対応ポリシーセットのキー |
| `skill_profile_key` | Single line text | — | 一覧の Skill Profile 欄 | 対応スキルプロファイルのキー |
| `source_priority_profile_key` | Single line text | — | 一覧の Source Priority 欄 | 対応ソース優先度プロファイルのキー |
| `is_test_only` | Checkbox | `false` | ステータスバッジ「test only」| true = テスト用途のみ |
| `notes` | Long text | — | — | 運用メモ |

### ステータスバッジのロジック

```
is_active = false            → "inactive" (グレー)
is_active = true, is_test_only = true  → "test only" (黄)
is_active = true, is_test_only = false → "active" (緑)
```

---

## 8. support_ai_test_targets

Bot 返信を許可するテスト対象を管理するテーブル。
`ENABLE_INTERCOM_REPLY=true` 時、このテーブルの `is_active=true` なレコードが返信許可リストになる。

### 必須カラム

| カラム名 | 型 | 必須 | Single Select 選択肢 | 補足 |
|---------|-----|:----:|---------------------|------|
| `target_type` | **Single Select** | ◎ | `contact` / `conversation` / `email` / `domain` / `company` / `plan` | 照合種別 |
| `target_value` | Single line text | ◎ | — | Intercom ID / メール / ドメイン / 会社名 / プラン名 |
| `is_active` | Checkbox | ◎ | — | false = Bot 返信許可から除外 |

### 推奨カラム

| カラム名 | 型 | デフォルト | Admin Console での使用箇所 | 補足 |
|---------|-----|----------|--------------------------|------|
| `label` | Single line text | — | 一覧の「ラベル」列 | 管理用人名・用途ラベル |
| `environment` | **Single Select** | — | 選択肢: `prod` / `staging` / `dev` | 環境フィルタ（将来 Rollout Rules と連携） |
| `concierge_key` | Single line text | — | 一覧の「Concierge」列 | このターゲットに使うコンシェルジュキー |
| `notes` | Long text | — | — | 運用メモ |

### target_type の照合挙動

| target_type | 照合タイミング | 現在実装 |
|------------|--------------|---------|
| `contact` | webhook受信時、contact ID で照合 | ✅ Bot `reply-guard.js` 実装済み |
| `conversation` | webhook受信時、conversation ID で照合 | ✅ Bot `reply-guard.js` 実装済み |
| `email` / `domain` / `company` / `plan` | 将来の Rollout Rules フェーズで実装 | 🔜 次フェーズ |

---

## 9. support_ai_rollout_rules（将来用途・スキーマ定義のみ）

### 目的

現在 Bot は `ENABLE_INTERCOM_REPLY` + env の allowlist（`TEST_CONTACT_IDS` / `TEST_CONVERSATION_IDS`）で返信を制御している。
このテーブルは、その制御を **NocoDB 管理の動的ルール** に段階的に移行するための基盤。

**ユースケース:**
- 特定メールドメインのユーザー → コンシェルジュ A に割り当て
- `plan: enterprise` のユーザー → フル機能を有効化
- `environment: staging` のみ Bot 返信を有効化
- `mode: shadow` で Bot 返信をログのみ（実送信なし）

**M3.5 時点の位置づけ:**
- スキーマ定義と NocoDB テーブル作成まで完了
- Bot Runtime への接続は次フェーズ
- Admin Console の UI（/rollout-rules ページ）は次フェーズ

### 必須カラム

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|:----:|------|
| `rule_name` | Single line text | ◎ | ルールの識別名 |
| `priority` | Number | ◎ | 評価順序（小さい値が優先） |
| `mode` | **Single Select** | ◎ | `allow` / `deny` / `shadow` |
| `is_active` | Checkbox | ◎ | false = このルールを無視 |

### 推奨カラム

| カラム名 | 型 | デフォルト | 補足 |
|---------|-----|----------|------|
| `environment` | Single Select | — | `prod` / `staging` / `dev` |
| `condition_json` | Long text | — | 照合条件（JSON）例: `{"target_type":"plan","target_value":"enterprise"}` |
| `assigned_concierge_key` | Single line text | — | このルールが適用された場合に使うコンシェルジュ |
| `notes` | Long text | — | 運用メモ |

### mode の意味

| mode | 挙動 |
|------|------|
| `allow` | 条件にマッチした場合 Bot 返信を許可 |
| `deny` | 条件にマッチした場合 Bot 返信を拒否 |
| `shadow` | 条件にマッチした場合 Bot 返信はログのみ（Intercom には送らない） |

### condition_json の想定フォーマット

```json
{
  "target_type": "plan",
  "target_value": "enterprise"
}
```

または複合条件（将来）:
```json
{
  "and": [
    { "target_type": "plan", "target_value": "enterprise" },
    { "target_type": "domain", "target_value": "bigcorp.com" }
  ]
}
```

---

## NocoDB 作業手順（あなたがやること）

### ステップ 1: すでに作成済みのテーブルに追加カラムを作る

#### support_ai_sessions（既存テーブル）

| カラム名 | 型 | 備考 |
|---------|-----|------|
| `evaluation` | **Single Select** | 選択肢: `good` / `bad` |
| `eval_reason` | Long text | |

> `evaluation` は **必ず Single Select** で作ること（Text 型不可）。

#### support_ai_knowledge_sources（テーブル ID: `mr6w8m6wdomb6vf`）

| カラム名 | 型 | 必須 | 備考 |
|---------|-----|:----:|------|
| `source_key` | Single line text | ◎ | |
| `source_name` | Single line text | ◎ | |
| `source_type` | Single line text | ◎ | |
| `description` | Long text | | |
| `source_url_or_path` | Single line text | | |
| `is_active` | Checkbox | | デフォルト: true |
| `sync_enabled` | Checkbox | | デフォルト: true |
| `freshness_status` | Single line text | | |
| `last_synced_at` | DateTime | | |
| `chunk_count` | Number | | |
| `published_chunk_count` | Number | | |
| `notes` | Long text | | |

#### support_ai_concierges（テーブル ID: `mcg9gyoxeoik8c3`）

| カラム名 | 型 | 必須 | 備考 |
|---------|-----|:----:|------|
| `concierge_key` | Single line text | ◎ | |
| `display_name` | Single line text | ◎ | |
| `description` | Long text | | |
| `intercom_admin_id` | Single line text | | |
| `persona_label` | Single line text | | |
| `policy_set_key` | Single line text | | |
| `skill_profile_key` | Single line text | | |
| `source_priority_profile_key` | Single line text | | |
| `is_active` | Checkbox | ◎ | デフォルト: true |
| `is_main` | Checkbox | ◎ | デフォルト: false |
| `is_test_only` | Checkbox | | デフォルト: false |
| `notes` | Long text | | |

**最初のレコード（メインコンシェルジュ）を手動で作成:**
```
concierge_key:  ptengine_support
display_name:   Ptengine サポート
persona_label:  丁寧・保守的
is_active:      true (チェック)
is_main:        true (チェック)
is_test_only:   false (チェックなし)
```

#### support_ai_test_targets（テーブル ID: `mezi75wt22e03v6`）

| カラム名 | 型 | 必須 | 備考 |
|---------|-----|:----:|------|
| `target_type` | **Single Select** | ◎ | 選択肢: `contact` / `conversation` / `email` / `domain` / `company` / `plan` |
| `target_value` | Single line text | ◎ | |
| `label` | Single line text | | |
| `environment` | **Single Select** | | 選択肢: `prod` / `staging` / `dev` |
| `concierge_key` | Single line text | | |
| `is_active` | Checkbox | ◎ | デフォルト: true |
| `notes` | Long text | | |

**最初のレコード（自分のテスト用）を手動で作成:**
```
target_type:  contact
target_value: （自分の Intercom contact ID）
label:        自分のテスト用
environment:  prod
is_active:    true (チェック)
```

#### support_ai_rollout_rules（テーブル ID: `mncoox6ol6eunqb`）

今フェーズは Bot が参照しないので、カラムだけ作っておく:

| カラム名 | 型 | 必須 | 備考 |
|---------|-----|:----:|------|
| `rule_name` | Single line text | ◎ | |
| `priority` | Number | ◎ | |
| `environment` | **Single Select** | | 選択肢: `prod` / `staging` / `dev` |
| `condition_json` | Long text | | |
| `assigned_concierge_key` | Single line text | | |
| `mode` | **Single Select** | ◎ | 選択肢: `allow` / `deny` / `shadow` |
| `is_active` | Checkbox | ◎ | デフォルト: false |
| `notes` | Long text | | |

### ステップ 2: Vercel に新しい環境変数を追加

Vercel Dashboard → Project → Settings → Environment Variables に以下を追加（Production + Preview に適用）:

```
NOCODB_KNOWLEDGE_SOURCES_TABLE_ID = mr6w8m6wdomb6vf
NOCODB_CONCIERGES_TABLE_ID        = mcg9gyoxeoik8c3
NOCODB_TEST_TARGETS_TABLE_ID      = mezi75wt22e03v6
NOCODB_ROLLOUT_RULES_ID           = mncoox6ol6eunqb
```

### ステップ 3: 追加後に確認

- `/concierges` で登録したレコードが表示される
- `/test-targets` でレコードを追加できる
- `/knowledge` のソースカードに同期情報が表示される
- `/overview` に Active Concierges / Test Targets / Last Sync が表示される

---

## 型エラー防止チェックリスト

| チェック | 内容 |
|---------|------|
| `evaluation` は Single Select | Text 型にすると空白フィルタが壊れる |
| `target_type` は Single Select | 追加の選択肢は必ずここで登録 |
| `mode` は Single Select | `allow` / `deny` / `shadow` |
| `concierge_key` が空でもエラーにしない | nullable で作成する |
| `is_active` / `is_main` / `is_test_only` は Checkbox | Number 型にしない |
| `last_synced_at` は DateTime | Bot が ISO 8601 文字列を書き込む |
