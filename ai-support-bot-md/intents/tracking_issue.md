# Intent: tracking_issue

## 定義

タグ設置、イベント計測、ヒートマップ計測、データ欠損など、計測そのものに関する問題。
「データが取れていない」「数値がおかしい」「計測が始まらない」などの発話が該当する。

**以下も tracking_issue に含む:**
- GTM タグのトリガーエラー・設置確認
- WordPress / Shopify でのタグ設置トラブル
- 体験 / WEB接客 / A/Bテスト / リダイレクトテストの CV 計測が「取れない」「0になっている」

**tracking_issue に含まない:**
- 「体験の設定方法がわからない」→ usage_guidance
- 「体験が反映されない・起動しない」→ experience_issue
- 「レポートの数値が GA4 と違う（差異の原因追求が主）」→ report_difference

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `project_name_or_id` | 対象プロジェクト名または ID | required |
| `target_url` | 計測対象の URL | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `occurred_at` | 発生日時または発生した時期 | required |
| `recent_change` | 直近のタグ・サイト変更の有無 | required |
| `tag_type` | タグの設置方法（GTM/直接/WordPress/Shopify等） | optional（自動推定） |

### tag_type の自動推定ルール（聞かない・自動推定）

| 発話キーワード | tag_type |
|---|---|
| 「GTM」「Google Tag Manager」 | `gtm` |
| 「WordPress」「header.php」「プラグイン」 | `wordpress` |
| 「Shopify」 | `shopify` |
| 「直接」「コピペ」「貼り付け」 | `direct` |
| 上記に当たらず、タグ系の問い合わせなら | 1問聴取 |

---

## Ask Priority

1. `symptom` — 何が起きているか
2. `project_name_or_id` — どのプロジェクトか
3. `occurred_at` — いつから
4. `target_url` — 対象 URL
5. `recent_change` — 直近の変更
6. `tag_type` — タグ種類（自動推定できない場合のみ）

---

## Handoff Minimum Condition

- **必須**: `symptom` が埋まっている
- **いずれか**: `occurred_at` または `target_url` が埋まっている

---

## Escalation 注意点

- 「全く計測されない」「全サイトで止まっている」など広範囲障害 → 即時 escalation
- 「至急」「緊急」などの高緊急ワード → 即時 escalation
- 計測不能による重大ビジネス影響の示唆 → escalation 検討

---

## Bot の質問方向性

- 「どのプロジェクトの、どのページで、何が起きているか」を軸に聞く
- GTM の場合は「GTM のトリガーが Ptengine 専用になっているか」を確認するよう促してよい
- WordPress の場合は「どこにタグを貼ったか（header.php かプラグイン経由か）」を確認
- 「計測されていない（0件）」と「数値がおかしい（差異がある）」を区別して聴取する
- タグ未設置・実装ミスを断定しない
- 原因特定は担当者に任せる

---

## 将来の Skill 候補

| skill 名 | 概要 |
|---|---|
| `skill_tag_check` | タグ設置状況の確認ガイド |
| `skill_known_tracking_issue` | 既知の計測問題とマッチング |
| `skill_help_center_tracking` | Help Center の計測設定記事を参照 |
