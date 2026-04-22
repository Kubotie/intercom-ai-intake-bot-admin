# Source: Notion FAQ DB

## Source Type
`notion_faq`

## URL
https://www.notion.so/ptmafia/2fe6643a981980069383dbce8d838ca3?v=2fe6643a981980c98449000c25f7ea86

## Purpose
社内 FAQ、運用補足、公開ヘルプでは不足する補助説明の参照元。

## Policy Gate
- **顧客返答可**: `published_to_bot=true` のもののみ
- 社内情報を含む可能性があるため `published_to_bot` フラグで個別判定
- 未設定 (null) は安全側に倒して不可

## 対象 intent
- `usage_guidance`
- `experience_issue`

## 実装状況

`src/lib/skills/faq-answer.js` にて skeleton 実装済み。
`support_ai_knowledge_chunks` テーブルに Notion FAQ データが同期されると自動で機能する。

**現フェーズの動作:**
- knowledge_chunks テーブルが空 → `handled=false` (Help Center に fallback)
- Notion sync job 実装後に自動で使えるようになる

## Priority
Help Center の後段。Help Center で答えられなかった質問への fallback として使用。

## Sync Rule (将来)
- 1日2回同期する
- ページタイトル、本文、最終更新日、タグを保持する
- `published_to_bot` フラグを手動で設定してから顧客返答対象にする
- `support_ai_knowledge_chunks` テーブルに書き込む

## Notes
- 社内担当者名・内部 URL が含まれる場合は `published_to_bot=false` にする
- 回答候補生成や担当者向け要約は `published_to_bot` に関わらず利用可
- CSE (notion_cse) とは別テーブルで管理する
