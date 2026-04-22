# Sync Rules

## Basic Rule
knowledgeフォルダ内のmdは知識本文ではなく、参照元定義である。

## Required Processing
- Web/Notionの本文取得は別ジョブで行う
- 取得結果はDBまたはローカルキャッシュへ保存する
- LLMはknowledge mdを直接読むのではなく、同期済みデータを参照する

## Do Not
- knowledge mdにFAQ本文を直接書き込まない
- 手動メンテナンスで大量の知識本文を保持しない
