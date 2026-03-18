# Daily Note Generator for Obsidian

天気・Googleカレンダー・ニュース要約を含むデイリーノートを自動生成するObsidianプラグインです。

## 機能

- 🌤️ **天気**（OpenWeatherMap API） — 指定都市の気温・湿度・風速をテーブル表示
- 📅 **Googleカレンダーの予定** — 今日のイベントを時系列で一覧表示
- 📰 **昨日のビッグニュース** — NHK News Web RSSから取得し、Gemini APIで日本語要約

## 生成されるノートの例

```markdown
# 2026年3月19日（木）

## 🌤️ 天気
☀️ **晴天**（Kawasaki）

| 項目 | 値 |
| --- | --- |
| 気温 | 18℃ |
| 最低 / 最高 | 14℃ / 21℃ |
| 湿度 | 55% |
| 風速 | 3.2 m/s |

## 📅 今日の予定
- 🕐 09:00〜10:00 **チームミーティング** 📍 会議室A
- 🕐 12:00〜13:00 **ランチ**
- 🕐 終日 **有給休暇**

## 📰 昨日のニュース
### AI 要約
- 政府は新たな経済対策を閣議決定し、物価高対策に重点を置いた方針。
- 大谷翔平選手がシーズン記録を更新。
- 能登半島地震の復興支援として追加の財政支援が決定。

### 見出し一覧
- [政府 経済対策を閣議決定](https://www3.nhk.or.jp/news/...)
- [大谷翔平 新記録達成](https://www3.nhk.or.jp/news/...)

---

## 📝 メモ

```

## セットアップ

### 1. ビルド

```bash
npm install
npm run build
```

### 2. プラグインのインストール

1. Vault の `.obsidian/plugins/daily-note-generator/` フォルダを作成
2. `main.js` と `manifest.json` をコピー
3. Obsidian の設定 → コミュニティプラグイン → Daily Note Generator を有効化

### 3. APIキーの取得と設定

プラグイン設定画面で以下を入力してください。

#### OpenWeatherMap（天気）

1. [openweathermap.org](https://openweathermap.org/) でアカウント作成
2. API Keys ページからキーを取得

#### Google Calendar（予定）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Calendar API を有効化
3. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
4. Client ID / Client Secret を設定画面に入力
5. Refresh Token を取得して設定画面に入力

<details>
<summary>Refresh Token の取得方法</summary>

```bash
# 1. 認可コードを取得（ブラウザで開く）
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline

# 2. 認可コードからリフレッシュトークンを取得
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_AUTH_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

レスポンスの `refresh_token` を設定画面に入力してください。
</details>

#### Gemini API（ニュース要約）

1. [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得

### 4. 動作確認

設定画面の各セクションにある「テスト」ボタンで接続確認ができます。

## 使い方

- **手動生成**: リボンアイコン（📅+）をクリック、またはコマンドパレットで「デイリーノートを生成」
- **自動生成**: 設定で「起動時に自動生成」を ON にすると、Obsidian 起動時にその日のノートが無ければ自動生成

## 技術スタック

- TypeScript（Obsidian Plugin API）
- OpenWeatherMap API
- Google Calendar API（OAuth 2.0）
- NHK News Web RSS
- Gemini 2.5 Flash-Lite API

## ライセンス

MIT
