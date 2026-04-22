# Intent 新設提案: experience_issue

**新設理由:**  
500件分析で体験/WEB接客/ポップアップ/A/Bテスト/リダイレクト関連の問い合わせが推定119件（全体の約24%）に上る。  
これらは現行の `usage_guidance`（設定方法）・`bug_report`（明確なエラー）・`tracking_issue`（計測問題）に分散しており、それぞれで slots・handoff・FAQ 接続が最適化されていない。  
「体験が反映されない」「プレビューと本番が違う」「ポップアップが表示されない」など体験系特有の問い合わせパターンが多く、専用 intent を設けることで対応精度が上がる。

---

## 新 intent の定義

**対象:**
- 体験（Experience）/ WEB接客 の設定・公開・配信・表示に関する問い合わせ
- ポップアップの設定・表示・公開に関する問い合わせ
- A/Bテスト（AB テスト）の設定・レポート・配信に関する問い合わせ
- リダイレクトテストの設定・CV計測に関する問い合わせ

**含まれる典型発話:**
- 「体験を公開したのに反映されない」
- 「ポップアップが起動しない（表示されない）」
- 「プレビューすると過去のデザインが表示される」
- 「表示回数が0のまま」
- 「ABテストの配信が50%で分散しない」
- 「リダイレクトテストでCVが計測されない」
- 「公開ボタンを押してもリンクが未設定と表示されて公開できない」
- 「体験の配信条件（セッション・デバイス・ページURL）について確認したい」
- 「プレビューで体験を確認したい」

**experience_issue に含まない:**
- 体験と無関係な使い方一般 → `usage_guidance`
- タグ設置・基本計測の問題 → `tracking_issue`
- 解約・課金 → `billing_contract`

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `experience_name` | 体験名・A/Bテスト名・ポップアップ名など | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `device_type` | PC / スマホ / 両方 | optional |
| `occurred_at` | 発生日時または発生した時期 | optional |
| `project_name_or_id` | 対象プロジェクト名または ID | optional |
| `target_url` | 対象 URL | optional |

---

## Ask Priority

1. `experience_name` — どの体験か（名前またはURL）
2. `symptom` — どんな症状か（反映されない/起動しない/数値がおかしい等）
3. `device_type` — PC か スマホ か（体験系は端末で挙動が変わるため重要）
4. `occurred_at` — いつから（公開直後か、数時間後か）

---

## Handoff Minimum Condition

- **必須**: `experience_name` が埋まっている
- **いずれか**: `symptom` または `device_type` が埋まっている

（体験名さえわかれば担当者が管理画面で直接確認できるため、早期 handoff を推奨）

---

## Escalation 注意点

- 「本番サイトで体験が全面停止している」「全ユーザーに影響している」→ 即時 escalation
- 「至急」「緊急」「本日リリース予定」などの高緊急ワード → 即時 escalation
- 体験・ポップアップの不具合で重大ビジネス影響（広告施策・EC 購買影響）の示唆 → escalation 検討

---

## Bot の質問方向性

- 「どの体験について、何が起きているか」を軸に聞く
- 体験名が不明な場合は「対象の体験名またはURLを教えてください」と聞く
- 「反映されない」の場合は公開操作からの経過時間を確認してよい（即時反映か遅延かの切り分け）
- 「プレビューと本番が違う」の場合は公開状態（下書き/公開中）を確認するよう促してよい
- 原因断定しない（体験設定の問題か、タグの問題か、ブラウザキャッシュかは担当者に任せる）

---

## 将来の Skill 候補

| skill 名 | 概要 | 優先度 |
|---|---|---|
| `skill_experience_faq` | 体験設定・公開・配信条件のよくある質問回答 | 高 |
| `skill_known_experience_issue` | 既知の体験バグ・反映遅延とマッチング | 高 |
| `skill_help_center_experience` | Help Center の体験関連記事を参照 | 中 |
| `skill_preview_troubleshoot` | プレビュー・反映確認の手順ガイド | 中 |

---

## 実装時の注意

- 既存 intent との競合を避けるため、分類ロジックでの優先順位: `billing_contract` > `login_account` > `experience_issue` > `tracking_issue` > `usage_guidance`
- 「体験」という単語が含まれていても「解約したいが体験中のプランについて」は `billing_contract` を優先
- 「体験のCV計測が取れない」は `experience_issue` か `tracking_issue` か判断困難。LLM prompt に例示として追加する
