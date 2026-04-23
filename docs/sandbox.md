# Sandbox — Bot 処理シミュレーター

> Admin Console `/sandbox` の設計・動作・使い方ドキュメント。

---

## 目的

本番を壊さずに policy / intent / skill / knowledge / concierge の変更を事前検証する。

- 発話を入力するだけで、実際のボット判断ロジックを全段階シミュレートできる
- Intercom への返信は送らない
- 本番 session / messages / slots への書き込みは行わない

---

## 2 つのモード

### Classifier Only モード（デフォルト）

**目的**: Intent 分類の結果だけを高速に確認する。

- 入力: 発話テキスト
- 出力: predicted category / confidence / 分類理由
- スロット収集・Skill 実行・NocoDB アクセスは行わない
- 実行が軽く（LLM 1 回のみ）、分類チューニングに集中できる
- 誤分類しやすい近接 Intent とその境界メモを表示

**使いどき**:
- `intent_misclassification` が続いていて原因を特定したい
- classifier_prompt.md を修正した後、変化を確認したい
- 新しい発話パターンがどの Intent に分類されるか確認したい

### Full Simulation モード

**目的**: 分類 → スロット収集 → Skill 実行 → 返信候補 まで全工程をシミュレートする。

- 入力: 発話 / Intent 強制指定（任意）/ Concierge 指定（任意）
- 出力: Full Simulation 結果（Summary / Routing / Knowledge / Reply / Raw JSON タブ）
- NocoDB knowledge 読み取り（read-only）を含む
- 変更前後の挙動比較に使う

**使いどき**:
- policy / handoff 条件を変えた後に確認
- knowledge 追加後に candidate_titles に新 FAQ が出るか確認
- concierge 別の挙動を確認

---

## モード比較

| 項目 | Classifier Only | Full Simulation |
|------|----------------|-----------------|
| LLM 呼び出し | 分類のみ（1回） | 分類 + スロット + 次質問（複数回） |
| NocoDB 読み取り | なし | knowledge_chunks / known_issues / concierges |
| 実行時間 | ~1 秒 | ~2〜5 秒 |
| 主な用途 | Intent 分類チューニング | Policy / Skill 全体確認 |

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

## プリセット発話

ワンクリックで入力欄に入るテストケース（両モード共通）。

| ラベル | 発話 | 期待 Intent |
|--------|------|------------|
| 使い方 | ヒートマップの見方を知りたいです | usage_guidance |
| 体験問題 | ABテストが反映されません | experience_issue |
| 計測問題 | タグを設置したのに計測されません | tracking_issue |
| ログイン | ログインできません | login_account |
| 請求 | プランを確認したいです | billing_contract |
| 数値差異 | 数値がレポートと違います | report_difference |

---

## intent_misclassification 改善フロー

```
1. Evaluation → Bad 評価で intent_misclassification を特定
2. /sandbox → Classifier Only で該当発話を入力
3. 誤分類なら「近接 Intent・境界メモ」でパターンを確認
4. /policies → classifier_prompt.md を展開して境界定義を確認
5. classifier_prompt.md を編集
6. Sandbox で再実行 → 正しく分類されるか確認
7. 境界ケースの発話を複数試してリグレッションがないか確認
8. git push → Vercel デプロイ → Evaluation でモニタリング
```

---

## 典型的な使い方

### Classifier Only: intent 分類チューニング

1. Sandbox でモードを「Classifier Only」にする
2. 誤分類が疑われる発話を入力 → 予測 Intent と confidence を確認
3. /policies で classifier_prompt.md を展開 → 境界定義を確認
4. 修正後に Sandbox で再確認 → git push でデプロイ

### policy 変更前の確認（Full Simulation）

1. `ai-support-bot-md/policies/` を編集する
2. `/sandbox（Full Simulation）` で「この発話がどう処理されるか」を確認
3. 意図通りなら main ブランチにマージ → 自動デプロイ

### intent 調整の確認（Full Simulation）

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

### POST `/api/sandbox/classify`（Classifier Only）

```json
// Request
{ "message": "ABテストが反映されません" }
```

```json
// Response
{
  "category": "experience_issue",
  "confidence": 0.92,
  "reason": "体験/ポップアップ系の表示不具合に言及",
  "input_message": "ABテストが反映されません",
  "executed_at": "2026-04-23T...",
  "prompt_file": "ai-support-bot-md/prompts/classifier_prompt.md"
}
```

### POST `/api/sandbox/run`（Full Simulation）

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
