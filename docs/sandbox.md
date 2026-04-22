# Sandbox — Bot 処理シミュレーター

> Admin Console `/sandbox` の設計・動作・使い方ドキュメント。

---

## 目的

本番を壊さずに policy / intent / skill / knowledge / concierge の変更を事前検証する。

- 発話を入力するだけで、実際のボット判断ロジックを全段階シミュレートできる
- Intercom への返信は送らない
- 本番 session / messages / slots への書き込みは行わない

---

## 本番との違い

| 項目 | 本番 (Webhook) | Sandbox |
|------|---------------|---------|
| Intercom 返信 | 送る | **送らない** |
| NocoDB sessions 書き込み | する | **しない** |
| NocoDB messages 書き込み | する | **しない** |
| NocoDB slots 書き込み | する | **しない** |
| NocoDB knowledge 読み取り | する | する（read-only） |
| NocoDB concierges 読み取り | する | する（read-only） |
| LLM 呼び出し | する | する |
| Test Target 判定 | する | しない（不要） |

---

## Sandbox で確認できること

- **Intent (category)**: LLM によるカテゴリ分類結果と confidence
- **Escalation 判定**: キーワード検出結果
- **Slots**: 発話から抽出されたスロット値と未収集スロット
- **Handoff 判定**: ready_for_handoff に到達するかどうか
- **Skill 選択**: どの skill が試行され、採用/非採用になったか
- **Retrieval Query**: 知識検索に使われたクエリ
- **Knowledge Candidates**: 検索でヒットした FAQ / Help Center 候補タイトル
- **Rejection Reason**: skill が不採用になった理由 (confidence_below_threshold 等)
- **Reply Source / Candidate**: 最終的にどの文面が選ばれるか
- **Concierge**: 解決された concierge 情報（指定時 or main fallback）
- **Decision Trace**: escalation → status → skill → reply_source の決定フロー

---

## 入力項目

| 項目 | 必須 | 説明 |
|------|------|------|
| ユーザー発話 | ✅ | シミュレートしたいメッセージ |
| Intent 強制指定 | — | 空 = 自動分類、指定時は分類スキップ |
| Concierge 指定 | — | 空 = Main Concierge、指定時はそのコンシェルジュ |

---

## 典型的な使い方

### policy 変更前の確認

1. `ai-support-bot-md/policies/` を編集する
2. `/sandbox` で「この発話がどう処理されるか」を確認
3. 意図通りなら main ブランチにマージ → 自動デプロイ

### intent 調整の確認

- Intent 強制指定で `experience_issue` を選択 → FAQ first の挙動を確認
- `usage_guidance` → Help Center first の挙動を確認

### knowledge 追加後の確認

- Notion FAQ sync 後、発話を入力して candidate_titles に新しい FAQ が出るか確認
- confidence が 0.65 を超えているか確認（skill 採用条件）

### concierge 比較の前段

- 同じ発話で concierge A と B を順に指定して実行 → concierge resolve 結果を比較
- ※ 今回は UI に比較モードなし（将来拡張を参照）

---

## API

### POST `/api/sandbox/run`

```json
// Request
{
  "message": "ABテストが反映されません",
  "force_category": "experience_issue",  // optional
  "concierge_key": "ptengine_support"    // optional
}
```

```json
// Response
{
  "category": "experience_issue",
  "category_forced": true,
  "confidence": 1.0,
  "should_escalate": false,
  "status": "collecting",
  "slots": [...],
  "slots_filled_count": 0,
  "slots_missing_count": 6,
  "selected_skill": "faq_answer",
  "reply_source": "faq_answer",
  "reply_candidate": "ABテストが反映されない主な原因として...",
  "answer_candidate_json": {
    "retrieval_query": "...",
    "candidate_titles": [...],
    "skill_candidates": [...]
  },
  "concierge": {
    "key": "ptengine_test",
    "name": "Ptengine test",
    "intercom_admin_id": "5031835",
    "source": "specified"
  },
  "decision_trace": "escalation=false > status=collecting > skill=faq_answer(accepted) > reply_source=faq_answer"
}
```

---

## 将来の比較モード

今回は単発シミュレーションのみ実装。以下は将来拡張の余地として設計を残す。

| 比較軸 | 説明 |
|--------|------|
| Concierge A vs B | 同じ発話で 2 concierge を並列実行し結果を横並び表示 |
| Auto vs Forced category | 自動分類 vs category 固定の結果差分を表示 |
| FAQ first vs HC first | skill registry の順序を変えた場合の影響 |
| Policy before/after | `ai-support-bot-md/` 変更前後の LLM 応答差分 |

API は今回の `/api/sandbox/run` を複数回呼び出すだけで比較モードは実装可能。

---

## 注意事項

- LLM を呼び出すため実行に 2〜5 秒かかる
- LLM_API_KEY 未設定の場合は category が `usage_guidance` に fallback し、スロット抽出も行われない
- skill 実行時に NocoDB knowledge_chunks / known_issues を参照するため、NocoDB が落ちているとエラーになる
- Sandbox 実行ログは Vercel Logs に `"sandbox": true` フラグ付きで出力される
