# Source: Notion CSE Cases

## Source Type
`notion_cse`

## URL
https://www.notion.so/ptmafia/28c6643a981980648d3af9467a776290?v=28c6643a9819809dad87000c7436c7dd

## Purpose
過去 CSE 対応事例を構造化して再利用するための参照元。

## Policy Gate
- **顧客返答不可**: `published_to_bot` に関わらず常に不可
- 内部補助のみに限定 — この方針は変更しない

## 対象 intent (内部補助のみ)
- `bug_report` — 類似事例の確認項目抽出補助
- `tracking_issue` — 切り分けパターン抽出補助

**CSE をどの skill の `allowedSourceTypes` にも含めてはいけない。**

## 利用可能な用途

| 用途 | 利用可否 |
|---|---|
| 顧客回答への直接使用 | ❌ 不可 |
| `summary_for_agent` 補強 | ✅ 可 |
| `recommended_next_step` 補助 | ✅ 可 |
| 類似事例ヒント (担当者向け) | ✅ 可 |
| LLM system prompt への組み込み | ✅ 可 (担当者向けに限る) |

## Sync Rule (将来)
- 生データをそのまま使わず、構造化して保存する
- category, symptom, required_checks, useful_response, dangerous_response を抽出する
- `reusable=true` 判定を通したものだけ検索対象にする
- 古い事例や例外案件を一般化しない

## Notes
- CSE 事例は変動が大きく、顧客に直接返すには品質保証が困難
- 担当者が「類似事例がある」と知ることで対応速度が上がる用途に特化
- 将来的に `support_ai_cse_cases` テーブルから `support_ai_knowledge_chunks` に同期予定
