# Intent 改訂提案: tracking_issue

**変更理由:**  
500件分析で tracking_issue は全体の4.6%（23件）。  
GTM/直接埋め込み/WordPress など「タグの種類」が担当者の確認手順を左右するが、現行 slots に含まれていない。  
また「体験（Experience）のCV計測ができない」「リダイレクトテストのCV計測が取れない」など、体験機能と組み合わさったケースが6件確認された。

---

## 変更箇所

### 1. Required Slots に `tag_type` を optional で追加

| slot 名 | 説明 | 必須度 | 変更 |
|---|---|---|---|
| `project_name_or_id` | 対象プロジェクト名または ID | required | 変更なし |
| `target_url` | 計測対象の URL | required | 変更なし |
| `symptom` | 具体的な症状 | required | 変更なし |
| `occurred_at` | 発生日時または発生した時期 | required | 変更なし |
| `recent_change` | 直近のタグ・サイト変更の有無 | required | 変更なし |
| `tag_type` | タグの設置方法（GTM/直接埋め込み/WordPress/Shopify等） | optional | **新規追加** |

**`tag_type` の収集方針:**  
発話に「GTM」「Google Tag Manager」が含まれる → 自動推定（聞かない）  
発話に「WordPress」「header.php」が含まれる → `wordpress` と推定  
発話に「Shopify」が含まれる → `shopify` と推定  
上記に当たらず、タグ設置系の問い合わせの場合のみ1問として聞く

### 2. 定義の拡張（体験系の計測問題を明示）

**追記:**  
体験/WEB接客/A/Bテスト/リダイレクトテストのCV計測が「取れない」「おかしい」も tracking_issue に含む。  
ただし「体験の設定方法がわからない」は usage_guidance に分類する。

### 3. Bot の質問方向性の追記

**追記:**
- GTM 設置の場合は「GTM のトリガー設定で『すべてのページ』または Ptengine 専用のトリガーが設定されているか」を確認するよう促してよい
- WordPress の場合は「タグを貼った場所（header.php か プラグイン経由か）」を確認してよい
- 「計測されていない」と「数値がおかしい」は区別して聴取する（前者は tracking_issue、後者は report_difference に近い）

---

## 変更後の全文（参考）

```markdown
# Intent: tracking_issue

## 定義

タグ設置、イベント計測、ヒートマップ計測、データ欠損など、計測そのものに関する問題。  
「データが取れていない」「数値がおかしい」「計測が始まらない」などの発話が該当する。

**以下も tracking_issue に含む:**
- 体験/WEB接客/A/Bテスト/リダイレクトテストのCV計測が「取れない」「0になっている」
- GTM タグのトリガーエラー・設置確認
- WordPress/Shopify でのタグ設置トラブル

**tracking_issue に含まない:**
- 「体験の設定方法がわからない」→ usage_guidance
- 「レポートの数値が GA4 と違う」→ report_difference（数値差異の原因追求が主の場合）

---

## Required Slots

| slot 名 | 説明 | 必須度 |
|---|---|---|
| `project_name_or_id` | 対象プロジェクト名または ID | required |
| `target_url` | 計測対象の URL | required |
| `symptom` | 具体的な症状（何が、どうなっているか） | required |
| `occurred_at` | 発生日時または発生した時期 | required |
| `recent_change` | 直近のタグ・サイト変更の有無 | required |
| `tag_type` | タグの設置方法（GTM/直接/WordPress/Shopify等） | optional |

### tag_type の自動推定ルール
- 「GTM」「Google Tag Manager」を含む → `gtm`
- 「WordPress」「header.php」「プラグイン」を含む → `wordpress`
- 「Shopify」を含む → `shopify`
- 「直接」「コピペ」を含む → `direct`
- 上記に当たらずタグ系の問い合わせなら1問聴取

---

## Ask Priority

1. `project_name_or_id` / `target_url` — どのプロジェクト・URL か
2. `symptom` — 何が起きているか
3. `occurred_at` — いつから
4. `recent_change` — 直近の変更
5. `tag_type` — タグ種類（自動推定できない場合のみ）

---

## Handoff Minimum Condition

- **必須**: `symptom` が埋まっている
- **いずれか**: `occurred_at` または `target_url` が埋まっている
- （変更なし）

---

## Escalation 注意点

- 「全く計測されない」「全サイトで止まっている」など広範囲障害 → 即時 escalation
- 「至急」「緊急」などの高緊急ワード → 即時 escalation

---

## Bot の質問方向性

- 「どのプロジェクトの、どのページで、何が起きているか」を軸に聞く
- GTM の場合は「トリガーが Ptengine 専用になっているか」を確認するよう促してよい
- WordPress の場合は「どこにタグを貼ったか（header.php か プラグイン経由か）」を確認
- 「計測されていない（0件）」と「数値がおかしい（差異がある）」を区別して聴取する
- タグ未設置・実装ミスを断定しない
```
