# Admin Console 運用ガイド

> intercom-ai-intake-bot-admin の各画面の役割と、日次・週次の運用ルーティン。

---

## 画面一覧と役割

| URL | 役割 | 主な利用シーン |
|-----|------|--------------|
| /overview | 全体サマリ・今日の統計・7日間トレンド | 毎朝の状況確認 |
| /conversations | 全会話一覧・検索 | 特定会話の調査 |
| /evaluation | Good/Bad 評価・改善ループ | 週次品質レビュー |
| /policies | Bot 行動ルール閲覧 | ポリシー確認・改善前調査 |
| /intents | Intent 定義・スロット・Skill ルーティング | 分類/ルーティング設計確認 |
| /knowledge | Knowledge Chunks・Known Issues 管理 | FAQ 追加・既知バグ登録 |
| /concierges | Concierge 設定・intercom_admin_id 管理 | 担当チーム設定 |
| /test-targets | Test Target 管理 | Bot 返信を許可する対象を制御 |
| /sandbox | Bot ロジックのシミュレーション | ポリシー変更前の確認 |

---

## 日次ルーティン（5分）

### 1. Overview 確認

**アクセス**: /overview

チェック項目:
- 「今日の統計」の Escalation 数 — 3 件超なら /conversations で内容確認
- 返信数が前日から大きく乖離していないか
- Skill 不採用が多い場合 → /sandbox で発話を再現

### 2. 異常時の対応

| 症状 | 確認先 | 対応 |
|------|--------|------|
| Escalation > 返信の 30% | /conversations でキーワード確認 | 03_escalation_policy.md を見直し |
| 返信数 0 のまま 1 時間以上 | Vercel Logs で "reply failed" を検索 | Intercom API 鍵・admin_id を確認 |
| Skill 採用率の急落 | /sandbox で発話を確認 | knowledge を追加 or threshold を調整 |

---

## 週次ルーティン（15分）

### 1. Evaluation レビュー

**アクセス**: /evaluation → "Bad" フィルタ

1. Bad 評価のセッションを確認
2. eval_reason から改善先を特定（画面上部のガイドを参照）
3. /sandbox で問題発話を再現して確認
4. 改善が必要なら対象ファイルを更新

### 2. トレンド確認

**アクセス**: /overview → 7日間トレンドチャート

- Skill 採用（緑）が下降 → knowledge 追加を検討
- Handoff（黄）が増加 → handoff 条件を確認
- Escalation（赤）が突出 → escalation キーワードを確認

### 3. Knowledge 鮮度確認

**アクセス**: /knowledge

- Knowledge Last Sync が 1 週間以上前 → Notion FAQ 同期を実施
- known_issues に新しいバグ情報があれば追加

---

## ポリシー変更のワークフロー

```
問題発見（Evaluation Bad / Monitoring 異常）
       ↓
/policies または /intents で現状確認
       ↓
/sandbox で問題発話を再現
       ↓
ai-support-bot-md/ のファイルを VSCode で編集
       ↓
/sandbox で修正後の挙動を確認
       ↓
git push origin main → Vercel 自動デプロイ
       ↓
/overview で翌日のトレンドを確認
```

詳細は [docs/policy_intent_management.md](policy_intent_management.md) を参照。

---

## Concierge 設定

Bot 返信者の Intercom アカウントは Concierge で管理する。

**設定変更が必要なケース**:
- 担当チームの Intercom アカウントが変わった → `intercom_admin_id` を更新
- 新しい対応チームを追加する → 新規 Concierge レコードを作成し `is_main` / rollout ルールを設定
- 特定ユーザーに別のコンシェルジュを割り当てる → Test Target + rollout ルールを設定

**`is_main` の Concierge は全ユーザーへのデフォルト返信者になる。必ず 1 つだけアクティブにすること。**

---

## Test Target 設定

Bot 返信を許可するユーザーを制御する設定。

- `target_type: contact_id` — 特定の Intercom contact ID に対してのみ Bot が返信
- `target_type: email_domain` — ドメイン単位で制御（例: `@example.com`）
- `target_type: all` — 全ユーザーに返信（本番公開時）

現在の設定状況: /test-targets で確認。

---

## ログ確認方法

Vercel Dashboard → Project → Logs で以下のフィールドで絞り込む：

| 調査目的 | 検索キーワード |
|---------|-------------|
| 返信成功/失敗 | `reply success` / `reply failed` |
| Intent 分類結果 | `category resolved` |
| Skill 採用結果 | `skill accepted` / `skill rejected` |
| Handoff 判定 | `session status updated` |
| Sandbox 実行 | `"sandbox": true` |
| Bot 返信対象外 | `test target not matched` |

詳細は [docs/monitoring.md](monitoring.md) を参照。
