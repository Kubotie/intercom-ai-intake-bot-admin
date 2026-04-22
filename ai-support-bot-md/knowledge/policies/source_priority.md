# Source Priority — 知識参照優先順位ポリシー

更新日: 2026-04-22

---

## 基本方針

**FAQ と Help Center は両方参照する。ただし intent ごとに優先順を変える。**

- FAQ (`notion_faq`): トラブルシューティング型が強い。「なぜこうなるか」「どう解決するか」の Q&A が87件
- Help Center (`help_center`): how-to コンテンツが強い。使い方・設定手順・操作説明に適している
- 両方を試し、最初に confidence ≥ threshold で採用した skill の回答を使う
- FAQ only / Help Center only にはしない

---

## intent 別の参照優先順

| intent | 試行順序 | 理由 |
|---|---|---|
| `usage_guidance` | **1. help_center_answer → 2. faq_answer** | how-to / 使い方 / 設定箇所は HC が強い。FAQ に how-to コンテンツはない |
| `experience_issue` | **1. faq_answer → 2. help_center_answer** | FAQ に「表示されない」「反映されない」「データ異常」系37件。HC より特化している |
| `bug_report` | 1. known_bug_match のみ | 既知バグ DB と照合 |

### なぜ usage_guidance と experience_issue で順序が逆か

```
usage_guidance (使い方を知りたい)
  ユーザー: 「ヒートマップの見方を知りたいです」
  → FAQ: how-to FAQ ゼロ → 候補が見つかっても confidence 低
  → Help Center: 使い方記事が期待できる → 先に試す

experience_issue (体験で問題が起きている)
  ユーザー: 「ポップアップが表示されません」
  → FAQ: 「ポップアップ/表示されない」系の記事が4件 → confidence 高
  → Help Center: 問題特化コンテンツは少ない → fallback でよい
```

---

## ソース別の性格と制約

| source_type | 性格 | 顧客返答可 | 条件 |
|---|---|---|---|
| `help_center` | how-to / 使い方 / 設定手順 | ✅ 常に可 | — |
| `notion_faq` | トラブルシューティング / 問題解決 | ✅ 条件付き | `published_to_bot=true` のみ |
| `known_issue` | 既知バグ / 制限事項 | ✅ 条件付き | `published_to_bot=true` のみ |
| `notion_cse` | 内部対応事例 | ❌ 不可 | 顧客返答に使わない（変更不可） |

---

## FAQ が強い領域 / 弱い領域 (2026-04 分析)

| 領域 | FAQ | Help Center |
|---|---|---|
| 体験が表示されない / 反映されない | **強い** (36件) | 弱い |
| ヒートマップの表示異常 / データ異常 | **強い** (27件) | 弱い |
| A/Bテスト / リダイレクトテスト乖離 | **強い** (10+5件) | 弱い |
| タグ設置・計測されない | **強い** (10件) | 中程度 |
| ポップアップ問題解決 | 中 (4件) | 中程度 |
| ヒートマップの使い方 (how-to) | **ない** | 期待できる |
| セグメント設定・使い方 | **ない** | 期待できる |
| ログイン・アカウント | **ない** | 期待できる |

---

## ルール

- `canExposeKnowledgeToCustomer()` を通過しないソースは返答に使わない
- ソース間で矛盾がある場合は Help Center を優先
- CSE を skill の `allowedSourceTypes` に含めてはいけない
- 閾値 (confidence ≥ 0.65) を下回った場合は次の skill に fallback
- 両 skill が rejected の場合は next_question または handoff に進む
