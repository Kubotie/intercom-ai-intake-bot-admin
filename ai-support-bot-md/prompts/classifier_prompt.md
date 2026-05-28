以下のユーザー発話を、定義済みカテゴリと2つの補助次元で分類してください。

## 動的カテゴリ定義の使用方法

入力 JSON に `category_definitions` が含まれている場合、各カテゴリの `description`・`examples`・`boundary_notes` を**優先的に**使用して分類すること。
`category_definitions` がない場合、または `category_definitions` に含まれないカテゴリは、以下のデフォルト定義を使うこと。

## デフォルトカテゴリ定義

- **tracking_issue**: タグ設置・GTM設定・イベント計測・データ欠損など計測そのものの問題。「計測されない」「GTMでエラー」「タグが検出されない」。体験/A/BテストのCV計測が取れない場合も含む。
- **report_difference**: レポート数値がGA4・社内集計と異なる・数値差異の原因追求が主。
- **login_account**: ログイン不可・パスワード・権限・招待メール・アカウントアクセスの問題。
- **billing_contract**: 解約・請求・プラン変更・契約更新・PV上限・トライアルと有償の違い。「解約したい」「プランを変えたい」「請求書の金額が違う」。
- **bug_report**: 明確な不具合・画面エラー・操作不能。「ボタンを押しても反応しない」「エラー画面が出る」「保存できない」。体験系の不具合は experience_issue を優先。
- **usage_guidance**: 使い方・設定方法・操作手順の案内。「〇〇はどこですか」「〇〇はどうやって設定しますか」「〇〇できますか」。不具合ではなく「わからない」系。
- **experience_issue**: 体験（Experience）/WEB接客/ポップアップ/A/Bテスト/リダイレクトテストの設定・公開・表示・配信に関する問い合わせ。「体験を公開したのに反映されない」「ポップアップが起動しない」「プレビューと本番が違う」「A/Bテストの配信比率がおかしい」「体験の表示条件を設定したい」。

## 分類優先順位

billing_contract > login_account > experience_issue > tracking_issue > bug_report > report_difference > usage_guidance

## 境界判定のポイント

- 「体験」「ポップアップ」「A/Bテスト」「リダイレクトテスト」「WEB接客」が主語の場合は **experience_issue** を優先
- 「GTM」「タグ」「計測」「トラッキング」が主語で体験との関係が薄い場合は **tracking_issue**
- 「体験のCV計測が取れない」は experience_issue と tracking_issue の境界 → **tracking_issue** を選ぶ
- 「解約したい」は billing_contract（怒りを伴っても billing_contract で収集してから handoff）
- 「できない」「動かない」は usage_guidance ではなく experience_issue か bug_report を検討
- 「プレビューで確認したい」「設定の仕方がわからない」は experience_issue か usage_guidance → 体験関連なら **experience_issue**
- **「GA4と数値が違う」「どちらのデータが正しいか」「なぜPtengineとGA4で差異があるか」は report_difference**（集計方法の質問形式でも数値差異の文脈なら report_difference）
- 「どのように集計しているか」が**GA4・他ツールとの比較・差異の文脈**で使われている場合は **report_difference**（単独で使い方を聞く場合は usage_guidance）

---

## アクション意図（action_intent）

ユーザーがそのトピックに対して「何をしたいか」を以下の4値から1つ選ぶこと。

- **troubleshoot**: 何かが動かない・エラーが出る・期待通りに動作しない状況を「直したい」。「〜できない」「〜が出ない」「〜がおかしい」。
- **learn**: 使い方・設定手順・機能の場所を「知りたい」。「〜はどうやるか」「〜はどこですか」「〜できますか（可否確認）」。
- **verify**: 現在の数値・設定・状態が「正しいか確認したい」。「〜と差異がある」「〜と一致しない」「〜は合っていますか」。
- **request**: プラン変更・解約・機能要望など「何かを変更・依頼したい」。「〜したい」「〜をお願いしたい」。

### action_intent 判定のポイント

- `troubleshoot` vs `learn`: 「今まさに動かない」は troubleshoot。「やり方を知りたい」は learn。
- `troubleshoot` vs `verify`: 症状がある（動かない）は troubleshoot。数値のずれを確認したいだけは verify。
- `billing_contract` は原則 `request`（解約・変更の意思表明）。請求内容の確認だけなら `verify`。
- `login_account` は原則 `troubleshoot`（ログインできない状態）。

---

## 緊急度（urgency）

- **high**: ビジネス影響が大きい、もしくは感情的な切迫感がある。「急いでいます」「今すぐ」「広告費が無駄」「キャンペーンが」「本番が」「至急」「困っています」。
- **normal**: 通常のサポート問い合わせ。

---

## 感情（sentiment）

- **frustrated**: 不満・焦り・怒りが読み取れる。「なぜ」「ずっと」「何度も」「おかしい」「困っている」「ひどい」。
- **neutral**: 感情的な要素が少なく、事実確認・情報収集のトーン。
- **positive**: 前向き・丁寧・感謝のトーン。

---

## Few-shot 例

**例1**
入力: 「GTMでPtengineのタグを設置したのですが、管理画面でタグが検出されませんと表示されます」
```json
{
  "category": "tracking_issue",
  "action_intent": "troubleshoot",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.92,
  "reason": "GTMタグが検出されない→計測問題かつ直したい意図"
}
```

**例2**
入力: 「ヒートマップの設定方法を教えてください。どこから作ればいいですか？」
```json
{
  "category": "usage_guidance",
  "action_intent": "learn",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.95,
  "reason": "設定方法を知りたい→learn。ヒートマップの使い方案内"
}
```

**例3**
入力: 「Ptengineのセッション数がGA4の数値と全然違うのですが、これは正常ですか？」
```json
{
  "category": "report_difference",
  "action_intent": "verify",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.90,
  "reason": "数値の差異を確認したい→verify。report_differenceの典型"
}
```

**例4**
入力: 「来月から料金プランをダウングレードしたいのですが、手続きを教えてください」
```json
{
  "category": "billing_contract",
  "action_intent": "request",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.93,
  "reason": "プラン変更の依頼→request。billing_contract"
}
```

**例5**
入力: 「A/Bテストのバナーが全く表示されません！キャンペーンが明日なので急いでいます」
```json
{
  "category": "experience_issue",
  "action_intent": "troubleshoot",
  "urgency": "high",
  "sentiment": "frustrated",
  "confidence": 0.94,
  "reason": "体験が表示されない→troubleshoot。明日キャンペーン→urgency:high"
}
```

**例6（report_difference と usage_guidance の境界）**
入力: 「Insight > ダイジェスト > 地域（訪問数）にて、Maharashtra からのアクセスが多く表示されているのですが、弊社側のGA4では該当データを確認できておりません。こちらについて、どのような方法・データソースで集計されているかご教示いただくことは可能でしょうか。」
```json
{
  "category": "report_difference",
  "action_intent": "learn",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.88,
  "reason": "GA4との地域データ差異を報告し、原因を知りたい→report_difference。「集計方法を教えて」という形式でも文脈は数値乖離の調査"
}
```

**例7（report_difference：集計差異 + 原因把握）**
入力: 「PtengineのInsightで表示される訪問数がGoogle Analyticsの数値と大きく異なります。どちらが正しいのでしょうか」
```json
{
  "category": "report_difference",
  "action_intent": "verify",
  "urgency": "normal",
  "sentiment": "neutral",
  "confidence": 0.92,
  "reason": "PtengineとGA4の数値差異の確認→report_difference。「どちらが正しいか」→verify"
}
```

---

## 返却形式

```json
{
  "category": "...",
  "action_intent": "troubleshoot|learn|verify|request",
  "urgency": "high|normal",
  "sentiment": "frustrated|neutral|positive",
  "confidence": 0.0,
  "reason": "..."
}
```
