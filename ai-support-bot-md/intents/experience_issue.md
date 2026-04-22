# Intent: experience_issue

## 定義

体験（Experience）/ WEB接客 / ポップアップ / A/Bテスト / リダイレクトテストの設定・公開・表示・配信に関する問い合わせ。
usage_guidance（使い方）・bug_report（明確なエラー）・tracking_issue（計測）の中間に位置し、体験系特有の問い合わせパターンに特化する。

**含む典型発話:**
- 「体験を公開したのに反映されない」
- 「ポップアップが起動しない（表示されない）」
- 「プレビューすると過去のデザインが表示される」
- 「表示回数が0のまま」
- 「A/Bテストの配信が50%で分散しない」
- 「リダイレクトテストでCVが計測されない」
- 「公開ボタンを押してもリンクが未設定と表示されて公開できない」
- 「体験の配信条件（セッション・デバイス・ページURL）について確認したい」
- 「プレビューで体験を確認したい」

**experience_issue に含まない:**
- 体験と無関係な使い方一般 → `usage_guidance`
- タグ設置・基本計測の問題（体験と関係ない） → `tracking_issue`
- 解約・課金 → `billing_contract`

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `experience_name` | 体験名・A/Bテスト名・ポップアップ名など | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `device_type` | PC / スマホ / 両方（自動推定） | optional |
| `occurred_at` | 発生日時または発生した時期 | optional |
| `project_name_or_id` | 対象プロジェクト名または ID | optional |
| `target_url` | 対象 URL | optional |

---

## Ask Priority

1. `experience_name` — どの体験か（名前またはURL）
2. `symptom` — どんな症状か（反映されない/起動しない/数値がおかしい等）
3. `device_type` — PC か スマホ か（自動推定できない場合のみ聴取）
4. `occurred_at` — いつから（公開直後か、数時間後か）

---

## Handoff Minimum Condition

- **必須**: `experience_name` が埋まっている
- **いずれか**: `symptom` または `device_type` が埋まっている

体験名さえわかれば担当者が管理画面で直接確認できるため、早期 handoff を推奨。

---

## Escalation 注意点

- 「本番サイトで体験が全面停止している」「全ユーザーに影響している」→ 即時 escalation
- 「至急」「緊急」「本日リリース予定」「本番が止まっている」→ 即時 escalation
- 広告施策・EC購買への重大ビジネス影響の示唆 → escalation 検討

---

## Bot の質問方向性

- 「どの体験について、何が起きているか」を軸に聞く
- 体験名が不明な場合は「対象の体験名またはURLを教えてください」と聞く
- 「反映されない」の場合は公開操作からの経過時間を確認してよい
- 「プレビューと本番が違う」の場合は公開状態（下書き/公開中）を確認するよう促してよい
- 「リンクが未設定」エラーはポップアップの設定問題として handoff してよい
- 原因を断定しない（体験設定の問題か、タグの問題か、キャッシュかは担当者に任せる）

---

## Skill 実装候補

| skill 名 | 状態 | 概要 |
|---|---|---|
| `skill_experience_faq` | 未実装 | 体験設定・公開・配信条件のよくある質問回答 |
| `skill_known_experience_issue` | 未実装 | 既知の体験バグ・反映遅延とマッチング |
| `skill_help_center_experience` | 未実装 | Help Center の体験関連記事を参照 |
