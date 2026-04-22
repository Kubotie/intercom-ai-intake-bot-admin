# Intent 改訂提案: usage_guidance

**変更理由:**  
500件分析で usage_guidance は全体の34.8%を占める最大カテゴリ。  
現行は `target_feature` または `user_goal` どちらか1つで handoff するため、担当者への情報引き継ぎが不十分なケースが多い。  
また体験/ヒートマップ/ポップアップ等の機能別 Help Center 接続精度を上げるため、`feature_category` の自動推定を追加する。

---

## 変更箇所

### 1. Required Slots に `feature_category` を optional 追加

| slot 名 | 説明 | 必須度 | 変更 |
|---|---|---|---|
| `target_feature` | 知りたい機能名または対象機能 | required | 変更なし |
| `user_goal` | 実現したいこと・やりたいこと | required | **both 必須に変更** |
| `feature_category` | 体験/ヒートマップ/ポップアップ/A/Bテスト/タグ等の機能分類 | optional | **新規追加（LLM が自動推定）** |

### 2. Handoff Minimum Condition の変更

**変更前:**
- 必須なし
- いずれか: `target_feature` または `user_goal` が埋まっている

**変更後:**
- **必須**: `target_feature` と `user_goal` の**両方**が埋まっている
- ただし `skill_help_center_answer` が confidence ≥ 0.65 で回答できた場合は、handoff 前に直接回答してよい（handoff 不要）

**理由:** 機能名だけ分かっても「何をしたいか」が不明では担当者が調査できない。体験系の複雑な質問では両方の情報が必須。

### 3. Bot の質問方向性の追記

**追記:**
- 「体験」「ヒートマップ」「ポップアップ」「A/Bテスト」「リダイレクト」「GTM」「フォーム」などの機能名が含まれる場合は、`feature_category` を自動推定する（聞かない）
- `user_goal` が不明な場合は「〇〇について、具体的にどのようなことを実現したいか教えていただけますか？」と1問で聞く
- 「できますか」「できますでしょうか」系は usage_guidance だが、操作してもできない/エラーが出る場合は `bug_report` または `experience_issue` への分岐を検討する

### 4. Skill 連携の強化

| skill 名 | 状態 | 変更内容 |
|---|---|---|
| `skill_help_center_answer` | 実装済み | `feature_category` を検索クエリに加える形で改良する |
| `skill_feature_guide` | 未実装 | 体験/ヒートマップ別の使い方ガイドとして優先実装推奨 |

---

## 変更後の全文（参考）

```markdown
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

### feature_category の推定ルール
- 「体験」「WEB接客」「Experience」→ `experience`
- 「ヒートマップ」「Heatmap」→ `heatmap`
- 「ポップアップ」→ `popup`
- 「A/Bテスト」「ABテスト」→ `ab_test`
- 「リダイレクト」→ `redirect_test`
- 「GTM」「タグ」「トラッキング」→ `tag_gtm`
- 「フォーム」→ `form`
- 「インサイト」→ `insight`
- 上記に該当しない → `general`

---

## Ask Priority

1. `target_feature` — どの機能について知りたいか
2. `user_goal` — 何を実現したいか
3. `feature_category` — LLM が自動推定（聞かない）

---

## Handoff Minimum Condition

- **必須**: `target_feature` と `user_goal` の両方が埋まっている
- ただし `skill_help_center_answer` が confidence ≥ 0.65 で回答した場合は handoff 不要

---

## Escalation 注意点

- 「有料機能か無料機能か」の確認が契約問題に発展する可能性 → billing_contract に分岐
- 「できない」→ 操作方法の問題か不具合か判断 → bug_report / experience_issue に分岐

---

## Bot の質問方向性

- 機能名が発話に含まれる場合は feature_category を自動推定し、聴取省略
- `user_goal` が不明な場合は1問で「〇〇について、具体的に何を実現したいか」を聞く
- Help Center 記事への誘導が最優先
- 操作手順は「〇〇から設定できます」程度に留め、断定しない
```
