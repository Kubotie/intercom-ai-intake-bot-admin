# intercom-ai-intake-bot-admin

Intercom AI 受付 Bot の Admin Console。Bot ロジックの実行・監視・設定・改善を一元管理する。

---

## 概要

このプロジェクトは以下を統合した単一の Next.js アプリケーション。

| 機能 | 説明 |
|------|------|
| **Bot 実行基盤** | Intercom Webhook を受け、分類 → スロット収集 → Skill → 返信する本番処理 |
| **Admin Console** | ポリシー閲覧・Knowledge 管理・会話確認・評価・監視 |
| **Sandbox** | 本番副作用ゼロで Bot ロジックをシミュレーション |

---

## 起動

```bash
npm run dev      # 開発サーバー起動 (port 3100)
npm run build    # ビルド確認
npm run lint     # Lint チェック
```

必須環境変数は `.env.local` に設定する。`NOCODB_BASE_URL`, `NOCODB_API_TOKEN`, `NOCODB_SESSIONS_TABLE_ID` など。

---

## 画面構成

| 画面 | URL | 役割 |
|------|-----|------|
| Overview | /overview | 全体サマリ・今日の統計・7日間トレンド |
| Conversations | /conversations | 会話一覧・詳細 |
| Evaluation | /evaluation | Good/Bad 評価と改善ループ |
| **Policies** | /policies | Bot 行動ルール閲覧（md ファイル） |
| **Intents** | /intents | Intent 定義・スロット・Skill ルーティング |
| Knowledge | /knowledge | FAQ・既知バグ管理 |
| Concierges | /concierges | 担当チーム設定 |
| Test Targets | /test-targets | Bot 返信対象ユーザー管理 |
| **Sandbox** | /sandbox | Bot ロジックのシミュレーション |

---

## アーキテクチャ

```
顧客メッセージ (Intercom)
        ↓
POST /api/intercom/webhook
        ↓
src/lib/bot/processor.js
  ├─ classifyCategory()       — LLM で Intent 分類
  ├─ extractSlots()           — LLM でスロット抽出
  ├─ isReadyForHandoff()      — 最小条件チェック
  ├─ runSkillOrchestration()  — FAQ / HC / 既知バグ照合
  ├─ resolveReplyMessage()    — 返信文決定
  └─ replyToConversation()    — Intercom に返信
        ↓
NocoDB (sessions / messages / slots)
```

### Bot 行動ルール管理

```
ai-support-bot-md/
  policies/     — 行動ルール（Mission, Handoff, Escalation など）
  intents/      — Intent 別の定義文書
  prompts/      — LLM プロンプト定義
  skills/       — Skill Orchestration 仕様
  knowledge/    — ナレッジソース設定
```

LLM プロンプトは `prompts/*.md` から動的に読み込まれる。

---

## 改善ループ

```
1. /overview で今日の統計・7日間トレンドを確認
2. /evaluation で Bad 評価セッションをレビュー
3. 改善先を特定:
   - intent_misclassification → /policies → classifier_prompt.md
   - over_handoff / over_questioning → /policies → handoff / slot
   - knowledge_miss → /knowledge → FAQ 追加
   - skill_misrouting → /intents → skills/registry.js
4. /sandbox で変更前後を確認
5. ファイルを編集 → git push → Vercel デプロイ
6. /overview でトレンドを翌日確認
```

---

## ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [docs/admin_console_ops.md](docs/admin_console_ops.md) | 日次・週次運用ルーティン |
| [docs/monitoring.md](docs/monitoring.md) | 異常検知・ログパターン |
| [docs/sandbox.md](docs/sandbox.md) | Sandbox の仕様・使い方 |
| [docs/policy_intent_management.md](docs/policy_intent_management.md) | Policies / Intents 管理方針 |

---

## デプロイ

Vercel に接続済み。`main` ブランチへの push で自動デプロイ。

Webhook URL: `https://[your-domain]/api/intercom/webhook`  
Basic Auth: `/` 以下の管理画面全体（Webhook は除外）
