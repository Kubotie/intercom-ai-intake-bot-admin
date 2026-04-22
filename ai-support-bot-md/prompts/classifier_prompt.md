以下のユーザー発話を、定義済みカテゴリのうち最も適切な1つに分類してください。

## カテゴリ定義

- **tracking_issue**: タグ設置・GTM設定・イベント計測・データ欠損など計測そのものの問題。「計測されない」「GTMでエラー」「タグが検出されない」。体験/A/BテストのCV計測が取れない場合も含む。
- **report_difference**: レポート数値がGA4・社内集計と異なる・数値差異の原因追求が主。
- **login_account**: ログイン不可・パスワード・権限・招待メール・アカウントアクセスの問題。
- **billing_contract**: 解約・請求・プラン変更・契約更新・PV上限・トライアルと有償の違い。「解約したい」「プランを変えたい」「請求書の金額が違う」。
- **bug_report**: 明確な不具合・画面エラー・操作不能。「ボタンを押しても反応しない」「エラー画面が出る」「保存できない」。体験系の不具合は experience_issue を優先。
- **usage_guidance**: 使い方・設定方法・操作手順の案内。「〇〇はどこですか」「〇〇はどうやって設定しますか」「〇〇できますか」。不具合ではなく「わからない」系。
- **experience_issue**: 体験（Experience）/WEB接客/ポップアップ/A/Bテスト/リダイレクトテストの設定・公開・表示・配信に関する問い合わせ。「体験を公開したのに反映されない」「ポップアップが起動しない」「プレビューと本番が違う」「A/Bテストの配信比率がおかしい」「体験の表示条件を設定したい」。

## 分類優先順位

billing_contract > login_account > experience_issue > tracking_issue > bug_report > usage_guidance

## 境界判定のポイント

- 「体験」「ポップアップ」「A/Bテスト」「リダイレクトテスト」「WEB接客」が主語の場合は **experience_issue** を優先
- 「GTM」「タグ」「計測」「トラッキング」が主語で体験との関係が薄い場合は **tracking_issue**
- 「体験のCV計測が取れない」は experience_issue と tracking_issue の境界 → **tracking_issue** を選ぶ
- 「解約したい」は billing_contract（怒りを伴っても billing_contract で収集してから handoff）
- 「できない」「動かない」は usage_guidance ではなく experience_issue か bug_report を検討
- 「プレビューで確認したい」「設定の仕方がわからない」は experience_issue か usage_guidance → 体験関連なら **experience_issue**

## 返却形式

```json
{
  "category": "...",
  "confidence": 0.0,
  "reason": "..."
}
```
