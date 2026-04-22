# Intent: login_account

## 定義

ログイン、権限、アカウントアクセス、メンバー招待などの問い合わせ。  
「ログインできない」「パスワードが通らない」「招待メールが届かない」「権限エラー」などが該当する。

---

## Required Slots (コードと同期)

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `account_email_or_user` | 問題が発生しているメールアドレスまたはユーザー名 | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `occurred_screen` | エラーが発生した画面 | required |
| `error_message` | 表示されているエラーメッセージ | required |

---

## Ask Priority (聴取優先順位)

1. `account_email_or_user` — どのアカウントか
2. `symptom` — どんな症状か
3. `occurred_screen` — どの画面で
4. `error_message` — エラーメッセージがあれば

---

## Handoff Minimum Condition

以下を満たした時点で handoff に切り替える:

- **必須**: `account_email_or_user` と `symptom` の両方が埋まっている

（`occurred_screen` と `error_message` は担当者が直接確認できるため、なくても handoff 可）

---

## Escalation 注意点

- 「全社員がログインできない」など広範囲アクセス障害 → 即時 escalation
- セキュリティ懸念（不正アクセス、権限漏洩）の示唆 → 即時 escalation
- 「至急」「緊急」などのワード → 即時 escalation
- 重要権限アカウント（オーナー、管理者）のアクセス不能 → escalation 検討

---

## Bot の質問方向性

- 「どのアカウントで、何が起きているか」を軸に聞く
- パスワードそのものや認証情報を聞かない（セキュリティ上）
- 「招待メールが届かない」はスパムフォルダ確認を促してよい
- 原因（システム障害か、設定ミスか）は断定しない

---

## 将来の Skill 候補

| skill 名 | 概要 |
|---|---|
| `skill_account_status_check` | アカウント状態確認の手順ガイド |
| `skill_help_center_login` | Help Center のログイン関連記事を参照 |
| `skill_invite_troubleshoot` | 招待メールのトラブルシューティング |
