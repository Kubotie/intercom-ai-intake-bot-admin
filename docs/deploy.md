# Admin Console — デプロイ手順

## 前提

- Node.js 20+
- Vercel CLI (`npm i -g vercel`) または Vercel Dashboard
- NocoDB の各テーブル ID が手元にある（`.env.local` 参照）
- M1 完了済み: NocoDB に `evaluation` / `eval_reason` カラムが存在する

---

## 1. Git リポジトリの初期化

```bash
cd /Users/kubotie/05_Develop/intercom-ai-intake-bot-admin
git init
git add .
git commit -m "Initial commit: Admin Console"
```

`.env.local` は `.gitignore` に含まれているためコミットされない。

---

## 2. Vercel へのデプロイ

### Vercel CLI を使う場合（推奨）

```bash
vercel
```

初回は対話式で以下を選択:

| 質問 | 回答 |
|------|------|
| Set up and deploy? | Y |
| Which scope? | kuboties-projects (または該当チームを選択) |
| Link to existing project? | N（新規作成） |
| Project name | `intercom-bot-admin`（任意） |
| In which directory is your code located? | `.` (デフォルト) |
| Want to modify default settings? | N（デフォルトのまま） |

Framework は自動検出（Next.js）されるのでそのまま。

### 本番デプロイ

```bash
vercel --prod
```

---

## 3. 環境変数の登録

Vercel Dashboard → Project → Settings → Environment Variables に以下を登録。
すべて **Server** 環境のみ（Clientへの公開は不要）。

| 変数名 | 値 | 用途 |
|-------|-----|------|
| `NOCODB_BASE_URL` | `https://odtable.ptmind.ai` | NocoDB API のベース URL |
| `NOCODB_API_TOKEN` | `RxjfhN...` | NocoDB 認証トークン（機密） |
| `NOCODB_SESSIONS_TABLE_ID` | `me9i0h2953mqxhp` | sessions テーブル |
| `NOCODB_MESSAGES_TABLE_ID` | `m2ki36ul3559pwt` | messages テーブル |
| `NOCODB_SLOTS_TABLE_ID` | `muxqqlwfay9vnwp` | slots テーブル |
| `NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID` | `me7r24il0sz8sn7` | knowledge_chunks テーブル |
| `NOCODB_KNOWN_ISSUES_TABLE_ID` | `mz9ilj4f5v3czka` | known_issues テーブル |
| `ADMIN_PASSWORD` | （強いパスワードを設定） | Basic Auth パスワード |

CLI で一括登録する場合:

```bash
vercel env add NOCODB_BASE_URL
vercel env add NOCODB_API_TOKEN
vercel env add NOCODB_SESSIONS_TABLE_ID
vercel env add NOCODB_MESSAGES_TABLE_ID
vercel env add NOCODB_SLOTS_TABLE_ID
vercel env add NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID
vercel env add NOCODB_KNOWN_ISSUES_TABLE_ID
vercel env add ADMIN_PASSWORD
```

各コマンドで Environment を聞かれたら `Production` と `Preview` を選択する。

> **注意**: `NOCODB_API_TOKEN` は機密情報です。Vercel Dashboard 上でも
> 「Sensitive」に設定することを推奨します（設定後は値が表示されなくなる）。

---

## 4. 認証方式

### Basic Auth（実装済み）

`src/middleware.ts` により、全ページに Basic 認証がかかります。

- **ユーザー名**: 任意（何でも構いません）
- **パスワード**: `ADMIN_PASSWORD` 環境変数の値

ブラウザでアクセスするとログインダイアログが表示されます。

```
URL:      https://<project>.vercel.app/
Username: (任意)
Password: ADMIN_PASSWORD に設定した値
```

`ADMIN_PASSWORD` が未設定の場合は認証なしで通過します（ローカル開発用）。

### パスワードの変更方法

```bash
vercel env rm ADMIN_PASSWORD production
vercel env add ADMIN_PASSWORD
vercel --prod  # 再デプロイが必要
```

---

## 5. Deploy 後の動作確認チェックリスト

以下を順番に確認してください。

### 認証
- [ ] `https://<project>.vercel.app/` にアクセスするとログインダイアログが出る
- [ ] 正しいパスワードでログインできる
- [ ] 間違ったパスワードで 401 が返る

### データ表示
- [ ] `/overview` — セッション数・Intent 分布・Source 分布が表示される
- [ ] `/conversations` — 会話一覧が表示される（NocoDB 400 エラーが出ない）
- [ ] `/conversations/{session_uid}` — 詳細ページが開き、タイムラインが見える
- [ ] `/evaluation` — unrated フィルタで未評価セッションが見える
- [ ] `/knowledge` — チャンク一覧が表示される
- [ ] `/logs` — セッション一覧が表示される、クリックで詳細ペインが開く

### 書き込み確認
- [ ] `/conversations/{session_uid}` の評価パネルで Good/Bad を選択して保存できる
- [ ] 保存後に「保存しました」が表示される
- [ ] NocoDB で `evaluation` カラムに値が入っていることを確認

---

## 6. トラブルシューティング

### Build エラー: 「NOCODB_BASE_URL is not defined」

Vercel に環境変数が登録されていない。  
`vercel env ls` で登録済み変数を確認し、不足があれば `vercel env add` で追加後に再デプロイ。

### 全ページが 500 エラー

NocoDB の接続エラーが多い。  
1. `NOCODB_BASE_URL` のスキーム（`https://`）が正しいか確認
2. `NOCODB_API_TOKEN` が有効かどうか NocoDB 側で確認
3. Vercel Functions の logs (`vercel logs <deployment-url>`) でエラー内容を確認

### 404 が返る（ページが存在しない扱い）

Root Directory の設定ミスの可能性。  
Vercel Dashboard → Project → Settings → Build & Development Settings の  
`Root Directory` が空（プロジェクトルート）になっているか確認。

### 評価保存が 500 エラー

`support_ai_sessions` に `evaluation` カラムが存在しない。  
M1 の手順に従い NocoDB にカラムを追加してください（[nocodb-schema.md](nocodb-schema.md) 参照）。

### 認証が効かない / 常に 401 になる

- 常に通過してしまう: `ADMIN_PASSWORD` が Vercel に設定されていない。
- 常に 401 になる: `ADMIN_PASSWORD` の値に記号が含まれている場合は Base64 エンコード上問題のない文字列（英数字）を推奨。

### `/conversations/[id]` が 404 になる

`session_uid` の形式を確認。会話一覧から遷移する場合は正常に動作するはず。  
URLを直打ちする場合は `sess_215473985635944` 形式（`sess_` + conversation_id）。
