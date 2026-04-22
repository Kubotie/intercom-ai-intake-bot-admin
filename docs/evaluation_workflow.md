# 評価ワークフロー (Evaluation Workflow)

AI サポート Bot の品質を日次・週次でチームが継続改善するための運用定義書。

---

## 1. Good / Bad の判断基準

### Good ✅

以下のいずれかを満たす場合は **Good**。

| 条件 | 例 |
|------|-----|
| AI が正確な回答を返し、顧客が解決できた | faq_answer で「カウントダウン設定の修正方法」を正しく回答 |
| Handoff でも適切な情報収集ができた | 必要 slot を揃えてエージェントに引き継いだ |
| Escalation が適切なタイミングで行われた | 「本番が止まっている」で即時エスカレーション |
| Intent は正しく、次質問も適切だった | collecting 状態で必要な slot を的確に質問 |

**Handoff・Escalation でも Good にしてよい。** AI の役割は「解決」だけでなく「適切な情報収集・引き継ぎ」も含む。

### Bad ❌

以下のいずれかに当てはまる場合は **Bad**。

| 条件 | 例 |
|------|-----|
| Intent を誤って分類した | 「ポップアップが表示されない」を usage_guidance に分類 |
| 知識が不足していて回答できなかった | FAQ に該当記事があるのに fallback になった |
| 回答内容が曖昧・不正確だった | 「設定を確認してください」しか言えなかった |
| 不必要に Handoff した | 1 問で解決できるのに情報収集を始めた |
| 質問を聞きすぎた | 1 ターンで 3 問以上聞いた |
| 回答のトーンが不適切だった | 問い合わせ文をそのまま繰り返した |

### 未評価の扱い

- **未評価 = まだレビューしていない**（悪いわけではない）
- 日次タスクとして「前日分の Unrated を消化する」を基本とする
- 量が多い場合は `faq_answer` / `fallback` / `escalation` を優先的にレビューする

### Partial Success の扱い

- AI が正しい情報を提供したが **説明が不十分**だった場合 → **Bad** (reason: `answer_too_vague`)
- AI が Handoff したが **slot が 1 つしか揃っていない**場合 → **Bad** (reason: `over_handoff`)
- Confidence が低かった（60% 未満）が回答は正しかった場合 → **Good**（精度改善は Knowledge 側の課題）

---

## 2. eval_reason 推奨タクソノミー

### フォーマット

```
タグキー | 自由コメント（省略可）
```

例:
```
knowledge_miss | ヒートマップの見方FAQ が足りない
answer_too_vague | 「設定を確認してください」だけで手順が書かれていない
intent_misclassification | experience_issue のはずが usage_guidance になった
```

### タグ一覧

| タグキー | 日本語 | 意味 | 改善先 |
|---------|--------|------|--------|
| `intent_misclassification` | Intent 分類ミス | カテゴリ判定が間違っている | Intents & Routing |
| `skill_misrouting` | Skill 選択ミス | 正しいスキルが選ばれていない | Skills |
| `knowledge_miss` | 知識不足 | FAQ / Help Center に該当チャンクがない | Knowledge |
| `answer_too_vague` | 回答が曖昧 | 回答文が不十分・抽象的 | Knowledge / Skills |
| `over_handoff` | 早すぎる Handoff | 自己解決できたはずなのに引き継いだ | Policies / Skills |
| `over_questioning` | 質問が多すぎる | 1 ターンで聞きすぎた | Policies |
| `tone_mismatch` | トーン不適切 | 文体・言い回しが不自然 | Skills |
| `wrong_knowledge_source` | 知識ソース誤り | FAQ ではなく Help Center を使うべきだった（またはその逆） | Knowledge |
| `wrong_concierge` | Concierge 設定ミス | 別の製品・窓口に向けるべきだった | Concierges |
| `other` | その他 | 上記に当てはまらない | コメント必須 |

### 入力手順（Admin Console）

1. `/evaluation` → Unrated をクリック
2. 一覧から会話を選んで「評価する →」
3. **Bad** を選択 → 理由タグをクリック
4. 必要なら自由コメントをテキストエリアに入力
5. 「評価を保存」をクリック

---

## 3. Bad 評価 → 改善先 対応表

| reason タグ | 優先改善先 | 作業内容 |
|------------|-----------|---------|
| `intent_misclassification` | **Intents & Routing** | プロンプトの category 定義を修正 |
| `skill_misrouting` | **Skills** | skill threshold / 優先順位を調整 |
| `knowledge_miss` | **Knowledge** | 不足チャンクを追加・Notion に FAQ を書く |
| `answer_too_vague` | **Knowledge** or **Skills** | チャンク本文を充実させる / answer_message テンプレート改善 |
| `over_handoff` | **Policies** | handoff 最小条件 (HANDOFF_MIN_CONDITION) を緩和 |
| `over_questioning` | **Policies** | slot 要件の必須/任意を見直す |
| `tone_mismatch` | **Skills** | answer_message のプロンプトを修正 |
| `wrong_knowledge_source` | **Knowledge** | source_priority.md の intent 別優先順位を修正 |
| `wrong_concierge` | **Concierges** | routing 条件を修正 |

### 改善フロー（簡易）

```
Bad 評価
  ↓
reason タグを確認
  ↓
┌── intent_* / skill_* ──→ /intents または /skills ページへ
├── knowledge_* / answer_* ──→ /knowledge ページへ、チャンク追加
├── over_* ──────────────→ /policies ページへ、設定値を確認
└── tone / wrong_concierge ─→ 担当者にエスカレーション
```

---

## 4. 日次運用フロー

**推奨担当**: CSM / サポートチームリーダー 1 名（15〜30 分）

### 手順

1. **Admin Console を開く** → `/evaluation`
2. **Unrated** タブを確認（前日から積み上がった未評価件数を確認）
3. 以下の優先順位でレビュー:
   - `faq_answer` + `help_center_answer`（AI が自己解決を試みたもの）
   - `fallback`（AI が答えられなかったもの → Bad 率が高い）
   - `escalation`（適切だったか確認）
4. 各会話を開いて Good / Bad を付ける
   - Bad の場合は reason タグを 1 つ選ぶ
   - コメントは「次のアクションがわかる内容」を一言
5. **目標**: 前日分（営業日）を当日中に消化

### 1 日の件数目安

| 件数 | 目安時間 |
|------|---------|
| 〜10件 | 15 分 |
| 11〜30件 | 30 分 |
| 31件〜 | 複数人で分担 |

---

## 5. 週次レビューフロー

**推奨担当**: プロダクト / CSM リーダー（30〜60 分 / 週）

### 月曜（または週初め）

1. **Bad reason の集計**:
   - `/evaluation` → Bad タブを開く
   - reason タグの傾向を目視で確認
   - 最多 reason が何か把握する

2. **改善候補の優先順位決定**:

   ```
   knowledge_miss が多い → 今週 Knowledge を追加
   intent_misclassification が多い → Intent 定義を修正
   over_questioning が多い → Policies の slot 要件を見直す
   ```

3. **アクション割り当て**:
   - 担当者と作業内容を決める
   - 完了目標日を設定

### 金曜（または週末）

1. 週次 Bad 件数と reason 分布を確認
2. 改善作業の完了確認
3. 改善後に Good 率が上がっているか確認

### 週次 KPI（目安）

| 指標 | 目標 |
|------|------|
| Unrated 件数 | ゼロ（当日消化） |
| Good 率 | 60% 以上（初期は 40% でも許容） |
| Bad の top reason | 毎週 1 件以上改善アクションを実施 |
| knowledge_miss の継続 | 2 週連続なら Knowledge 追加を最優先 |

---

## 6. 運用者ロール

| ロール | 作業 | 頻度 |
|--------|------|------|
| **日次レビュアー** | Unrated を消化して Good/Bad を付ける | 毎営業日 |
| **週次分析担当** | Bad reason を集計して改善優先度を決める | 週 1 回 |
| **ナレッジ管理者** | knowledge_miss を受けて Notion FAQ を追加・編集 | 週 1〜2 回 |
| **ポリシー管理者** | over_*/intent_* を受けてコード・md を修正してデプロイ | 随時 |

---

## 7. Admin Console 各ページの用途

| ページ | 日次で使うか | 用途 |
|--------|------------|------|
| `/evaluation` | ✅ 毎日 | Unrated 消化・Bad 確認 |
| `/conversations/[id]` | ✅ 毎日 | 個別会話の評価・詳細確認 |
| `/overview` | 週 1 | 全体トレンド確認 |
| `/logs` | 必要時 | AI 判断フロー詳細デバッグ |
| `/knowledge` | 週 1〜2 | チャンク管理 |
| `/conversations` | 必要時 | Intent / Source でフィルタして調査 |
