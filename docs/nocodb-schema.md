# NocoDB スキーマ定義書

Admin Console / Bot Runtime が前提とする NocoDB テーブル定義。
**Admin Console を動かす前にこのドキュメントの通りにカラムを作成・確認してください。**

---

## テーブル一覧

| テーブル名 | 役割 | env 変数 |
|-----------|------|---------|
| `support_ai_sessions` | セッションごとの AI 判断・状態管理 | `NOCODB_SESSIONS_TABLE_ID` |
| `support_ai_messages` | ユーザー/Bot メッセージ履歴 | `NOCODB_MESSAGES_TABLE_ID` |
| `support_ai_slots` | slot 収集 (情報ヒアリング) | `NOCODB_SLOTS_TABLE_ID` |
| `support_ai_knowledge_chunks` | FAQ / Help Center チャンク | `NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID` |
| `support_ai_known_issues` | 既知バグ・既知問題リスト | `NOCODB_KNOWN_ISSUES_TABLE_ID` |

---

## support_ai_sessions（最重要テーブル）

### 基本識別子

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|------|------|
| `session_uid` | Single line text | ◎ | 形式: `sess_{conversation_id}` |
| `intercom_conversation_id` | Single line text | ◎ | Bot が findSession のキーとして使う |
| `intercom_contact_id` | Single line text | | Intercom の contact ID |
| `latest_user_message` | Long text | | 最新のユーザー発話 |

### 状態管理

| カラム名 | 型 | 必須 | 選択肢 | 補足 |
|---------|-----|------|--------|------|
| `status` | Single Select | ◎ | ↓ | Bot が書き込む |
| `category` | Single Select | | ↓ | LLM が分類後に書き込む |
| `priority` | Single line text | | `medium` | 現状は固定値 |
| `should_escalate` | Checkbox | | | エスカレーション判定結果 |

**status 選択肢（NocoDB DB 値 ≠ bot internal 値に注意）:**

| NocoDB 値 | Bot 内部値 | 意味 |
|-----------|-----------|------|
| `collecting` | collecting | 情報収集中 |
| `ready_to_answer` | ready_for_handoff | Handoff 準備完了 |
| `answered` | handed_off | Handoff 完了 |
| `escalated` | — | 手動設定用（Bot は直接書かない） |
| `closed` | — | 手動設定用（Bot は直接書かない） |

**category 選択肢（必ずこの7つを事前登録すること）:**

| 値 | 意味 |
|----|------|
| `tracking_issue` | 計測・トラッキングの不具合 |
| `report_difference` | レポート数値の差異 |
| `login_account` | ログイン・アカウント問題 |
| `billing_contract` | 請求・契約内容 |
| `bug_report` | 機能不具合の報告 |
| `usage_guidance` | 機能の使い方・操作案内 |
| `experience_issue` | 体験・表示・データ問題 |

### Observability フィールド（Bot が自動書き込み）

| カラム名 | 型 | 補足 |
|---------|-----|------|
| `selected_skill` | Single line text | 採用されたスキル名 |
| `reply_source` | Single Select | ↓ |
| `handoff_reason` | Single line text | Handoff 理由 |
| `escalation_reason` | Single line text | Escalation 理由 |
| `filled_slots_count` | Number | 収集済みスロット数 |
| `missing_slots_count` | Number | 未収集スロット数 |
| `reply_preview` | Long text | 送信メッセージの先頭300文字 |
| `customer_intent_summary` | Single line text | 顧客意図の日本語説明 |
| `recommended_next_step` | Single line text | 担当者への推奨アクション |
| `decision_trace` | Single line text | 判断フローのトレース文字列 |
| `answer_candidate_json` | Long text | ターンごとのスキル候補 JSON |
| `final_summary_json` | Long text | 返信確定後のサマリ JSON |

**reply_source 選択肢（必ずこの8つを事前登録すること）:**

| 値 | 意味 |
|----|------|
| `next_message` | LLM が生成した追加質問 |
| `handoff` | Handoff 固定文面 |
| `escalation` | Escalation 固定文面 |
| `faq_answer` | FAQ スキルによる回答 |
| `help_center_answer` | Help Center スキルによる回答 |
| `known_bug_match` | 既知バグマッチによる回答 |
| `fallback` | 固定フォールバック文 |
| `already_handed_off` | 二重返信防止（スキップ済み） |

### 評価フィールド（今回追加が必要）

| カラム名 | 型 | 必須 | 補足 |
|---------|-----|------|------|
| `evaluation` | Single Select | | 選択肢: `good`, `bad` / 空欄許容 |
| `eval_reason` | Long text | | タグ + コメントを ` \| ` で結合して保存 |

**`evaluation` を Single Select にする理由:** Admin Console の Evaluation ページが `(evaluation,eq,good)` / `(evaluation,blank,true)` でフィルタリングするため、Text 型だと NocoDB の blank フィルタが効かない。

**`eval_reason` を Long text にする理由:** eval-panel.tsx が `reason_tag | フリーコメント` を結合した文字列を保存する。将来 `eval_reason_tag` (Single Select) と `eval_reason_comment` (Long text) に分割しやすいようにするため、現状は1カラムで受ける。

---

## support_ai_messages

| カラム名 | 型 | 補足 |
|---------|-----|------|
| `session_uid` | Single line text | sessions と紐づけるキー |
| `intercom_message_id` | Single line text | 重複処理防止の主キー |
| `role` | Single line text | `user` / `bot` |
| `author_type` | Single line text | Admin Console でのフィルタ用 |
| `message_text` | Long text | |
| `message_order` | Number | 会話内の順序 |
| `created_at_ts` | Single line text | ISO 8601 文字列 |
| `raw_payload_json` | Long text | Intercom 生 payload |
| `topic` | Single line text | Intercom event topic |

---

## support_ai_slots

| カラム名 | 型 | 補足 |
|---------|-----|------|
| `session_uid` | Single line text | |
| `slot_name` | Single line text | カテゴリ別スロット名 (categories.js 参照) |
| `slot_value` | Long text | |
| `is_required` | Checkbox | |
| `is_collected` | Checkbox | |
| `source` | Single line text | `user_message` / `system` |
| `confidence` | Number | 0.0–1.0 |

---

## support_ai_knowledge_chunks

| カラム名 | 型 | 補足 |
|---------|-----|------|
| `chunk_id` | Single line text | 一意ID |
| `source_type` | Single line text | `faq` / `help_center` |
| `source_name` | Single line text | ソース名 |
| `title` | Single line text | |
| `body` | Long text | チャンク本文 |
| `tags` | Single line text | カンマ区切り |
| `published_to_bot` | Checkbox | false = Bot が参照しない |
| `is_active` | Checkbox | false = 論理削除 |
| `url` | Single line text | 元ページURL |
| `updated_at` | Single line text | ISO 8601 |

---

## support_ai_known_issues

| カラム名 | 型 | 補足 |
|---------|-----|------|
| `issue_key` | Single line text | 一意キー |
| `title` | Single line text | |
| `matching_keywords` | Long text | マッチキーワード（カンマ区切り） |
| `customer_safe_message` | Long text | Bot が送信する文面 |
| `status` | Single line text | `active` / `resolved` |
| `published_to_bot` | Checkbox | false = Bot が参照しない |

---

## NocoDB 作業チェックリスト（M1 完了まで）

### 今すぐやること

- [ ] `support_ai_sessions` に `evaluation` カラムを追加
  - 型: **Single Select**
  - 選択肢: `good`, `bad`
  - Required: OFF（空欄許容）

- [ ] `support_ai_sessions` に `eval_reason` カラムを追加
  - 型: **Long text**
  - Required: OFF

- [ ] `category` カラムの選択肢に以下がすべて登録されているか確認・追加
  - `tracking_issue`, `report_difference`, `login_account`, `billing_contract`, `bug_report`, `usage_guidance`, `experience_issue`

- [ ] `reply_source` カラムの選択肢に以下がすべて登録されているか確認・追加
  - `next_message`, `handoff`, `escalation`, `faq_answer`, `help_center_answer`, `known_bug_match`, `fallback`, `already_handed_off`

- [ ] `status` カラムの選択肢に以下がすべて登録されているか確認・追加
  - `collecting`, `ready_to_answer`, `answered`, `escalated`, `closed`

### 確認事項

- [ ] `intercom_conversation_id` カラムが存在することを確認（`conversation_id` ではなく）
- [ ] `intercom_contact_id` カラムが存在することを確認

---

## これが欠けていると壊れる機能

| 欠けているカラム/設定 | 壊れる機能 |
|-------------------|---------| 
| `evaluation` が Single Select でない | Evaluation ページの `(evaluation,blank,true)` フィルタが機能しない |
| `evaluation` が未登録 | eval-panel の保存時に NocoDB 400 エラー |
| `eval_reason` が未作成 | 評価理由が保存されない（エラーなし・silently ignore） |
| `category` に選択肢未登録 | Bot の category 保存時に 400 エラー → セッション更新失敗 |
| `reply_source` に選択肢未登録 | Observability フィールド保存時に 400 エラー → NocoDB に記録されない |
| `intercom_conversation_id` がない | Bot の findSession が常に空を返し → 全会話が新規セッション扱い |
