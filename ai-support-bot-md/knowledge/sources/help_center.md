# Source: Ptengine Help Center

## Source Type
`help_center`

## URL
https://helps.ptengine.com/

## Purpose
Ptengine の公開 FAQ・操作方法・設定手順を参照するための一次ソース。

## Policy Gate
- **顧客返答可**: 常に可 (`published_to_bot` フラグ不問)
- 公開情報のため社内情報を含まない

## 対象 intent
- `usage_guidance` (最優先)
- `experience_issue` (体験/WEB接客系の使い方・トラブル)

## 実装状況

`src/lib/skills/help-center-answer.js` にて実装済み。

- `searchHelpCenter(query)` が JSON API または HTML スクレイプで候補記事を最大2件取得
- `fetchArticleBodyFromUrl(url)` が記事本文 (最大 2,000 文字) を取得して LLM に渡す
- `confidence ≥ 0.65` のときのみ回答を採用 (orchestrator で判定)
- 取得失敗・タイムアウト時は `handled=false` を返し bot 全体は落ちない

## 優先 FAQ トピック (実履歴分析より)

| 機能 | 想定件数 | 優先度 |
|---|---|---|
| 体験 設定・公開・配信条件 | 63件 | 高 |
| ヒートマップ セグメント・CV絞り込み | 47件 | 高 |
| ポップアップ 公開設定・リンク設定 | 25件 | 高 |
| プレビュー/公開 反映タイミング | 9件 | 高 |
| タグ/GTM 設置エラー | 13件 | 高 |
| PV上限 説明・超過対応 | 6件 | 中 |
| A/Bテスト レポートの見方 | 17件 | 中 |

## Sync Rule
- 毎日1回クロールまたは取得対象 URL 一覧を更新する
- タイトル、本文、カテゴリ、URL を保持する
- 将来的に `support_ai_knowledge_chunks` テーブルに同期する予定
