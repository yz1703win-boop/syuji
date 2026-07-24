# 日報ツール

始業日報・終業日報・週次チャットをタブで切り替えて作成できるWebツールです。

## 機能

- **始業日報 / 終業日報**: 日付に合わせてテンプレートを自動生成・編集・コピー
- **週次チャット**: Googleカレンダーから当週（月〜金）の予定を自動取得してテンプレートを生成
- **前週参照**: 週次チャットタブで前週の保存済みコンテンツを折りたたみ表示
- **テンプレート編集**: 各タブのテンプレートをアプリ内で編集・保存可能
- **自動保存**: 編集中のテキストをデバウンスしてNeonに自動保存
- **コピーボタン**: クリップボードへコピーと同時にDBに保存

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **ホスティング**: Vercel
- **DB**: Neon (サーバーレス Postgres)
- **認証**: NextAuth.js v5 (Google OAuth)
- **カレンダー**: Google Calendar API

## セットアップ

### 1. 環境変数を設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集して各値を設定してください。

### 2. Google Cloud Console の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」から **Google Calendar API** を有効化
3. 「認証情報」→「OAuth 2.0 クライアント ID」を作成
   - アプリの種類: **ウェブアプリケーション**
   - 承認済みの JavaScript 生成元: `http://localhost:3000`
   - 承認済みのリダイレクト URI: `http://localhost:3000/api/auth/callback/google`
4. クライアント ID とシークレットを `.env.local` に設定

### 3. Neon DB の設定

1. [Neon](https://neon.tech/) でプロジェクトを作成
2. 接続文字列を `DATABASE_URL` に設定
3. アプリ起動後、以下でテーブルを初期化:

```bash
curl -X POST http://localhost:3000/api/init
```

### 4. 開発サーバーを起動

```bash
npm run dev
```

## Vercel へのデプロイ

1. Vercel に Neon インテグレーションを追加
2. 環境変数を Vercel のダッシュボードに設定
   - `DATABASE_URL`
   - `AUTH_SECRET` (`openssl rand -base64 32` で生成)
   - `AUTH_URL` (本番URLに変更)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
3. Google Cloud Console の承認済みリダイレクト URI に本番URLを追加

## テンプレートのプレースホルダー

### 始業・終業日報
| プレースホルダー | 説明 |
|---|---|
| `{{date}}` | 今日の日付（例: 7月22日(水)） |

### 週次チャット
| プレースホルダー | 説明 |
|---|---|
| `{{monday_date}}` 〜 `{{friday_date}}` | 各曜日の日付（例: 7/21(月)） |
| `{{monday_events}}` 〜 `{{friday_events}}` | Googleカレンダーの各曜日の予定 |
| `{{week_range}}` | 週の期間（例: 7/20(月)～7/24(金)） |
| `{{prev_action_change}}` | 前週の行動変化セクション |
| `{{prev_week_tasks}}` | 前週のタスク目標セクション |
