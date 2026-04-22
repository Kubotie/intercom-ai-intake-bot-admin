# Handoff Policy

## handoff の目的

Bot が必要最低限の情報を収集した後、追加質問を止めて担当者に引き継ぐ。
顧客に「Bot がずっと質問し続ける」という不快感を与えないことが目的。

---

## handoff に切り替えるタイミング

**カテゴリごとの最小条件** を満たした時点で handoff に切り替える。
全 required slots が揃う前でも、最小条件を満たせば handoff でよい。

| カテゴリ | 必須 slot | いずれか1つ |
|---|---|---|
| tracking_issue | symptom | occurred_at または target_url |
| report_difference | report_name | compare_target または date_range |
| login_account | account_email_or_user, symptom | — |
| billing_contract（通常） | — | contract_target または inquiry_topic |
| billing_contract（解約・返金） | account_email_or_user, inquiry_topic | — |
| bug_report | symptom | reproduction_steps または occurred_at |
| usage_guidance | target_feature, user_goal（両方必須） | — |
| experience_issue | experience_name | symptom または device_type |

## usage_guidance の特別ルール

skill_help_center_answer が confidence ≥ 0.65 で回答した場合は handoff 不要。
直接回答で session を完了してよい。

**usage_guidance の handoff 判定フロー:**
1. skill_help_center_answer を実行
2. confidence ≥ 0.65 → 直接回答（handoff しない）
3. confidence < 0.65 → slot 収集続行
4. target_feature + user_goal が揃った → handoff

## 解約申請フォーム形式の特別処理

inquiry_topic に「解約」が含まれ、account_email_or_user が埋まっており、
クレームシグナル（怒り・返金要求・放置への不満）がない場合は、
escalation より structured handoff を優先する。

---

## handoff 文面の方針

- 「必要な情報を確認できた」ことを伝える
- 「担当者が確認する」ことを伝える
- 「必要に応じて追加連絡する」ことを伝える
- 原因・解決策は断定しない

**現在の固定文面:**
> ご共有ありがとうございます。必要な情報を確認できましたので、担当者に引き継いで確認いたします。必要に応じて追加でご連絡します。

---

## handoff 後の動作

- **追加質問は一切しない**
- `session.status` を `handed_off` に遷移させる
- handed_off のセッションに新しいメッセージが届いても、intake をやり直さない
- slot の保存は継続してよい（情報の補完のみ）
- 担当者への自動通知は現フェーズでは未実装（将来実装予定）

---

## escalation との優先関係

escalation と handoff が競合した場合、**escalation が常に優先される**。

```
優先度:
1. should_escalate=true → escalation 固定文面
2. handoff 最小条件を満たした → handoff 固定文面
3. slot 収集継続 → next_message
4. エラー時 → fallback 固定文面
```

---

## コードとの対応

| 概念 | 実装箇所 |
|---|---|
| handoff 最小条件 | `src/lib/handoff-guard.js` `isReadyForHandoff()` |
| billing_contract 解約特別処理 | `src/lib/handoff-guard.js` `isCancellationCase()` |
| handoff 判定タイミング | `src/lib/processor.js` Step 9b |
| handoff 文面 | `src/lib/handoff-guard.js` `HANDOFF_REPLY` |
| status 遷移 | `src/lib/nocodb-mapper.js` `STATUS_TO_DB` |
| reply 優先順位 | `src/lib/reply-resolver.js` `resolveReplyMessage()` |
