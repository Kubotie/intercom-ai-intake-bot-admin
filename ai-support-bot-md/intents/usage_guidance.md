# Intent: usage_guidance

## 定義

使い方、設定方法、どこから何を操作するか、ベストプラクティスの案内。
「〇〇機能はどこにありますか」「〇〇はどうやって設定しますか」「〇〇できますか」などが該当する。
不具合ではなく「使い方がわからない」系の問い合わせ。

体験 / ヒートマップ / ポップアップ / A/Bテスト / リダイレクト / インサイト / GTM 等の機能固有の使い方もここに含む。
「できない」「動かない」に変化した場合は bug_report / experience_issue に分岐する。

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `target_feature` | 知りたい機能名または対象機能 | required |
| `user_goal` | 実現したいこと・やりたいこと | required |
| `feature_category` | 機能分類（LLM が発話から自動推定） | optional（自動推定） |

### feature_category の推定ルール（聞かない・自動推定）

| 発話キーワード | feature_category |
|---|---|
| 「体験」「WEB接客」「Experience」 | `experience` |
| 「ヒートマップ」「Heatmap」 | `heatmap` |
| 「ポップアップ」 | `popup` |
| 「A/Bテスト」「ABテスト」「リダイレクトテスト」 | `ab_test` |
| 「GTM」「タグ」「トラッキング」 | `tag_gtm` |
| 「フォーム」 | `form` |
| 「インサイト」 | `insight` |
| 上記に該当しない | `general` |

---

## Ask Priority

1. `target_feature` — どの機能について知りたいか
2. `user_goal` — 何を実現したいか（「〇〇について、具体的に何をしたいか教えていただけますか？」）
3. `feature_category` — LLM が自動推定（聞かない）

---

## Handoff Minimum Condition

- **必須**: `target_feature` と `user_goal` の**両方**が埋まっている
- ただし `skill_help_center_answer` が confidence ≥ 0.65 で回答した場合は handoff 不要（直接回答で完結）

**変更理由（実履歴分析より）:** 機能名だけ分かっても「何をしたいか」が不明では担当者が調査できない。
体験系・ヒートマップ系の複雑な質問では両方の情報が必須。

---

## Escalation 注意点

- 「有料機能か無料機能か」の確認が契約問題に発展する可能性 → billing_contract に分岐
- 「できない」→ 操作方法の問題か不具合か判断 → bug_report / experience_issue に分岐

---

## Bot の質問方向性

- 機能名が発話に含まれる場合は feature_category を自動推定し、聴取省略
- `user_goal` が不明な場合は1問で「〇〇について、具体的に何を実現したいか」を聞く
- Help Center 記事への誘導が最優先（`skill_help_center_answer` が実装済み）
- 操作手順は「〇〇から設定できます」程度に留め、断定しない

---

## Skill 実装状況

| skill 名 | 状態 | 概要 |
|---|---|---|
| `skill_help_center_answer` | **実装済み** | Help Center の記事を検索して回答する。confidence ≥ 0.65 のときのみ回答採用。 |
| `skill_feature_guide` | 未実装 | 機能ごとの使い方ガイド（feature_category 別に優先実装推奨） |
| `skill_onboarding_flow` | 未実装 | 初期設定・オンボーディング手順の案内 |

### skill_help_center_answer の動作

- `category === "usage_guidance"` かつ `status === "collecting"` のみ実行
- `target_feature` / `user_goal` / `feature_category` スロット + user message → 検索クエリ生成
- `https://helps.ptengine.com/` から候補記事を最大2件取得
- LLM で回答文 + confidence を生成
- confidence ≥ 0.65 → `answer_type: "help_center_answer"` として返信（handoff 不要）
- confidence < 0.65 → 従来の next_message / handoff フローに戻る
- 取得エラー時は bot 全体を落とさず `answered=false` を返す
