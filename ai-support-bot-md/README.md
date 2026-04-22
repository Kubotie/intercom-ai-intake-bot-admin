# AI Support Bot — Definition Layer

このディレクトリは、Intercom 上で動作する AI Support Bot の **振る舞い定義** を管理する。  
コード (`src/lib/`) が実行系、このディレクトリが **運用定義層 (definition layer)** として機能する。

---

## ディレクトリ構成

```
ai-support-bot-md/
├── policies/          Bot 全体の振る舞いルール
│   ├── 00_mission.md
│   ├── 01_global_behavior.md
│   ├── 02_tone_and_style.md
│   ├── 03_escalation_policy.md
│   ├── 04_answer_boundaries.md
│   ├── 05_slot_collection_rules.md
│   └── 06_handoff_policy.md       ← handoff 条件と遷移ルール
│
├── intents/           問い合わせカテゴリごとの詳細定義 (拡充版)
│   ├── tracking_issue.md
│   ├── report_difference.md
│   ├── login_account.md
│   ├── billing_contract.md
│   ├── bug_report.md
│   └── usage_guidance.md
│
├── categories/        旧定義 (intents/ が拡充版。将来廃止予定)
│   └── *.md
│
├── skills/            回答 skill の設計定義 (未実装)
│   └── README.md
│
├── prompts/           LLM に渡すシステムプロンプト
│   ├── classifier_prompt.md
│   ├── slot_extractor_prompt.md
│   ├── next_question_prompt.md
│   ├── summarizer_prompt.md
│   └── system_prompt.md
│
├── knowledge/         知識ソースの定義 (本文ではなく参照先定義)
│   ├── sources/
│   │   ├── help_center.md
│   │   ├── notion_faq_db.md
│   │   └── notion_cse_db.md
│   └── policies/
│       ├── source_priority.md
│       └── sync_rules.md
│
└── CODE_MD_MAPPING.md  コードと md の対応表
```

---

## 各ディレクトリの役割

### `policies/` — Bot の振る舞いルール

Bot 全体に適用されるルールを定義する。  
LLM の system prompt として渡すことを想定している（将来）。

| ファイル | 内容 |
|---|---|
| `00_mission.md` | Bot の目的・ミッション |
| `01_global_behavior.md` | 基本動作・禁止事項 |
| `02_tone_and_style.md` | トーン・文体 |
| `03_escalation_policy.md` | escalation 判断基準 |
| `04_answer_boundaries.md` | 回答できる範囲の定義 |
| `05_slot_collection_rules.md` | slot 収集のルール |
| `06_handoff_policy.md` | handoff タイミングと遷移ルール |

### `intents/` — 問い合わせカテゴリ定義

各カテゴリの詳細定義。`categories/` より情報が多い。

各 intent md に含まれる情報:
- intent の定義
- required slots (コードの `REQUIRED_SLOTS_BY_CATEGORY` と同期)
- ask priority (コードの `SLOT_PRIORITY_BY_CATEGORY` と同期)
- handoff minimum condition (コードの `HANDOFF_MIN_CONDITION_BY_CATEGORY` と同期)
- escalation 注意点
- Bot の質問方向性
- 将来の skill 候補

### `skills/` — 回答 Skill の設計定義 (未実装)

Skill とは「特定の intent に対して Bot が行う回答アクション」のこと。  
現フェーズでは設計定義のみ。実装は将来フェーズ。

### `knowledge/` — 知識ソースの定義

**知識の本文はここには書かない。** 参照先の定義のみ置く。

- `sources/help_center.md` — Help Center の URL・構造
- `sources/notion_faq_db.md` — Notion FAQ DB の構造
- `sources/notion_cse_db.md` — CSE ケース DB の構造

### `prompts/` — LLM プロンプト

Bot が LLM を呼び出すときに使うシステムプロンプト。  
コードの `src/lib/llm.js` → `src/lib/policy-loader.js` → ここのファイルを読む。

---

## 重要原則

- Bot は最初から原因を断定しない
- Bot はまず必要情報を集める
- Bot は同じ質問を繰り返さない
- Bot は 1 ターンで最大 2 項目まで確認する
- Bot は高リスク案件を即時エスカレーションする
- Bot は最小条件が揃ったら handoff に切り替える
- Bot は handed_off 後に追加質問しない

---

## コードとの対応

詳細は [CODE_MD_MAPPING.md](CODE_MD_MAPPING.md) を参照。

**現フェーズ:** コードが source of truth (md は運用仕様書)  
**将来フェーズ:** md が source of truth (コードが md を読んで動く)
