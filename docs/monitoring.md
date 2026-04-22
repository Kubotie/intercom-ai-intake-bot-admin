# Monitoring & Alerting — 運用監視ガイド

> Admin Console `/overview` の監視機能と、日次・週次レビュー手順。

---

## Overview ページの構成

### 今日の統計（JST 0:00 以降）

| 指標 | 説明 |
|------|------|
| 返信数 | ボットが返信したセッション数 |
| Handoff | 人間エージェントへ引き継いだ数 |
| Escalation | キーワードエスカレーションした数 |
| Skill 採用 | faq_answer / help_center_answer / known_bug_match で回答できた数 |
| Skill 不採用 | skill を試みたが threshold 未満で棄却された数 |

### 7日間トレンドチャート

NocoDB の sessions テーブルから直近7日分を集計して表示する。JST 日付でバケット。

- 棒グラフ：返信・Skill採用・Handoff・Escalation の日別推移
- 集計は Next.js Server Component 側で実施（クライアントは recharts 描画のみ）

---

## 異常検知の基準

### 即時確認が必要

| 状況 | 目安 |
|------|------|
| Escalation が当日の 30% を超える | キーワード誤検出 or 実障害の可能性 |
| Skill 採用率が前週比 20pt 以上低下 | knowledge が stale または LLM 応答劣化 |
| 返信数が急増 (前日比 3× 超) | スパムまたはループ返信の疑い |
| 返信数が 0 のまま 1 時間経過 | Webhook 到達不可 or 処理エラー |

### 週次レビューで確認

- Handoff 率のトレンド（増加 → スロット設計の見直し）
- Skill 不採用が多い category（knowledge 追加 or threshold 調整）
- evaluation: `bad` が付いたセッション（Conversations ページから確認）

---

## ログパターン

Vercel Logs で以下のフィールドを検索する。

### 正常フロー

```
"reply success"
  reply_source: faq_answer | help_center_answer | known_bug_match | next_message | handoff | escalation
  category: experience_issue | usage_guidance | ...
  concierge_key: ptengine_support | ...
```

### 異常パターン

```
"reply failed"           → Intercom API エラー。admin_id or 権限確認
"reply skipped (already_handed_off)"  → 二重返信防止（正常）
"test target not matched"  → 非テストユーザー or ロールアウト対象外（正常）
"sandbox: classification failed"  → LLM エラー (sandbox のみ)
"slot extraction failed"   → LLM エラー。fallback で次質問は生成される
"skill orchestration failed"  → NocoDB 接続エラーの可能性
```

### Sandbox 実行ログ

```json
{ "sandbox": true, "category": "...", "reply_source": "...", "selected_skill": "..." }
```

本番セッションと混在するので `"sandbox": true` でフィルタして除外する。

---

## 通知戦略（現状）

- **Vercel Logs アラート**: Vercel Dashboard → Project → Logs → Alerting でキーワード `"reply failed"` や `"skill orchestration failed"` に Slack 通知を設定可能
- **自動アラートは未実装**: 現状は Overview ページの手動確認が主な監視手段
- **将来拡張**: `/api/monitoring/alert` エンドポイントを作り、Cron Job で日次サマリを Slack に投稿

---

## 日次レビュー手順

1. `/overview` の「今日の統計」を確認
2. Escalation > 3 件 → Conversations で内容確認
3. Skill 不採用が多い → Sandbox で該当発話を再現して knowledge 候補を確認
4. 7日間トレンドで前週比を目視確認

## 週次レビュー手順

1. Skill 採用率の週次平均を計算（直近 200 件の byReplySource から）
2. Handoff 率が 40% を超えている場合 → スロット収集ロジックか知識不足を確認
3. `evaluation: bad` のセッションを Conversations から抽出してパターン分析
4. knowledge sync の鮮度を確認（Knowledge Last Sync カード）
