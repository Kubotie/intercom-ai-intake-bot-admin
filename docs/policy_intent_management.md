# Policy & Intent Management

> Admin Console の `/policies` と `/intents` の役割・運用手順・将来の編集方針。

---

## 目的

Bot の回答品質は以下の 3 層で制御されている。

| 層 | 場所 | 管理画面 |
|---|------|---------|
| 行動ルール | `ai-support-bot-md/policies/*.md` | /policies |
| Intent 定義・スロット・ルーティング | `categories.js`, `skills/registry.js` | /intents |
| ナレッジ | NocoDB (knowledge_chunks, known_issues) | /knowledge |

本ドキュメントは上位 2 層の管理方針を説明する。

---

## /policies で見られるもの

### グループ構成

| グループ | 対象ファイル | 役割 |
|---------|------------|------|
| 行動・トーン | 00_mission, 01_global_behavior, 02_tone_and_style, 04_answer_boundaries, 05_slot_collection_rules | Bot の基本姿勢・文体・スロット収集ルール |
| Handoff | 06_handoff_policy | 引き継ぎの条件・タイミング・special case |
| Escalation | 03_escalation_policy | 即時エスカレーション条件 |
| ナレッジ優先 | knowledge/policies/source_priority.md | FAQ vs Help Center の使い分け |
| プロンプト | prompts/*.md | LLM に渡すプロンプトの定義 |
| Skill | skills/README.md | Skill Orchestration Framework |

### 各ポリシーの役割

**00_mission.md** — Bot の存在意義と禁止事項。「原因を断定しない」「最大 2 問まで」の根拠。

**01_global_behavior.md** — 1 ターンあたりの行動原則。スロット収集 → skill 試行 → Handoff の流れ。

**03_escalation_policy.md** — キーワード検出でエスカレーションするルール。現在のキーワードリスト。

**06_handoff_policy.md** — 最小条件を満たしたら引き継ぐ（全スロット不要）。解約時の special case。

**classifier_prompt.md** — Intent 分類 LLM プロンプト。7 カテゴリの定義と判定優先度。

**source_priority.md** — usage_guidance は Help Center 優先、experience_issue は FAQ 優先の根拠。

---

## /intents で見られるもの

各 intent カードを展開すると以下が確認できる：

| 項目 | ソース | 説明 |
|-----|--------|------|
| 代表発話例 | 静的定義（intents/*.md 参考） | 分類の判断基準 |
| 処理フロー | logic 由来 | knowledge-first か否か、skill の有無 |
| スロット表（聴取順） | `SLOT_PRIORITY_BY_CATEGORY` | 優先順位・必須/任意の区分 |
| Skill 実行順 | `skills/registry.js` | 試みる skill の順序と説明 |
| Handoff 条件 | `HANDOFF_MIN_CONDITION_BY_CATEGORY` | 最小条件の内容 |

### 必須収集 vs 任意スロットの違い

- **必須収集**（`REQUIRED_SLOT_NAMES_BY_CATEGORY`）: LLM が積極的に聴取する対象
- **任意**（`REQUIRED_SLOTS_BY_CATEGORY` にのみ存在）: 会話中に自然に出てきたら収集するが、積極的には聞かない

例: `experience_issue` の `device_type` は任意—聞かなくても担当者が対応できることが多い。

---

## 運用課題と改善場所の対応表

| Evaluation の症状 | 原因として疑う箇所 | 改善対象 |
|-----------------|-----------------|---------|
| `intent_misclassification` | classifier_prompt の曖昧な境界 | /policies → classifier_prompt.md |
| `over_handoff` | handoff 条件が緩すぎる | /policies → 06_handoff_policy.md + `HANDOFF_MIN_CONDITION_BY_CATEGORY` |
| `over_questioning` | 必須スロットが多すぎる | /intents → `REQUIRED_SLOT_NAMES_BY_CATEGORY` を縮小 |
| `knowledge_miss` | FAQ/HC に該当コンテンツなし | /knowledge → FAQ 追加, Help Center 同期 |
| `skill_misrouting` | skill 採用基準 or 順序が不適切 | /intents → `skills/registry.js` の order/threshold |
| `wrong_tone` | tone_and_style が不適切 | /policies → 02_tone_and_style.md |

---

## ポリシー更新の手順

### 現在のフロー（read-first, git 経由）

```
1. Admin Console /policies でポリシー内容を確認
2. /sandbox で「この発話がどう処理されるか」を事前確認
3. VSCode で ai-support-bot-md/ 内の md ファイルを編集
4. /sandbox で再確認（回答が意図通りか）
5. git push origin main → Vercel 自動デプロイ → 本番反映
```

### 変更影響の見分け方

| 変更対象 | 影響範囲 | 確認コスト |
|---------|---------|---------|
| policies/*.md | LLM 応答の傾向変化 | Sandbox で複数発話を確認 |
| classifier_prompt.md | Intent 分類精度 | Sandbox で境界ケース発話を確認 |
| categories.js | スロット収集・handoff 条件 | Sandbox + Intents 画面で確認 |
| skills/registry.js | Skill 実行順序 | Sandbox で knowledge-first intent を確認 |
| NocoDB knowledge_chunks | Skill の回答内容 | Sandbox → Knowledge Candidates を確認 |

---

## 将来の inline edit 方針

### 今回（M7）: read-first

- Admin Console からポリシー内容を閲覧できる
- 編集は VSCode + git push が前提
- Sandbox で変更前後を確認

### 次段階: 簡易 inline edit

以下の順番で実装を検討：

1. **md ファイルの textarea 編集** — `/policies/[id]/edit` でテキストエリア表示、保存時は `fs.writeFileSync` + git commit API 呼び出し
2. **categories.js の slot 設定 UI** — 必須スロット・優先順を UI から変更し、ファイルを自動更新
3. **draft → active フロー** — 編集時に `_draft` ファイルを作成、review 後に active に昇格

### 本番反映フロー候補

| フロー | 概要 | リスク |
|--------|------|--------|
| git API 経由 commit | Admin から GitHub API で直接 push | merge conflicts に注意 |
| PR ベース | Admin で PR 作成、GitHub でレビュー後 merge | 一番安全 |
| local-only deploy | Vercel CLI で直接 deploy | git history に残らない |

**推奨**: PR ベース。変更の追跡可能性と rollback しやすさを重視。

---

## 注意事項

- `categories.js` と md ファイルは **独立して管理**されている。どちらかだけ変えても不整合になりうる
- handoff 条件を緩くすると Handoff 率が上がり、担当者負荷が増える。変更後は Evaluation / Overview で 1 週間モニタリング推奨
- `classifier_prompt.md` の変更は LLM 分類に即時影響する。段階的に変更し Sandbox で確認すること
