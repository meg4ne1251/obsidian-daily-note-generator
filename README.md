# Daily Note Generator

天気・Googleカレンダー・ニュース要約を含むデイリーノート（Markdown）を **cron で自動生成** するスクリプトです。Obsidian には干渉せず、指定したディレクトリに `.md` ファイルを置くだけのシンプルな構成です。

## 機能

- 🌤️ **天気**（OpenWeatherMap API） — 指定都市の気温・湿度・風速をテーブル表示
- 📅 **Googleカレンダーの予定** — 今日のイベントを時系列で一覧表示
- 📰 **昨日のニュース** — Google News RSS から3カテゴリ（一般 / IT・技術 / インフラ・クラウド）を取得し、Gemini API で日本語要約

## 生成されるノートの例

```markdown
# 2026年5月25日（月）

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

## 📰 昨日のニュース
### 🌐 一般ニュース
#### AI 要約
- ...

#### 見出し一覧
- [タイトル](https://...)

---

## 📝 メモ

```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` を `.env` にコピーし、各値を入力します。

```bash
cp .env.example .env
```

```env
# ノートの出力先（絶対パス推奨）
OUTPUT_DIR=/home/megane/Obsidian/Vault/DailyNotes

# OpenWeatherMap
OPENWEATHERMAP_API_KEY=...
WEATHER_CITY=Kawasaki

# Google Calendar (OAuth)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

# Gemini API
GEMINI_API_KEY=...
```

### 3. APIキーの取得

#### OpenWeatherMap（天気）
1. [openweathermap.org](https://openweathermap.org/) でアカウント作成
2. API Keys ページからキーを取得

#### Google Calendar（予定）
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Calendar API を有効化
3. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
4. Refresh Token を取得（下記参照）

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

レスポンスの `refresh_token` を `.env` に設定してください。
</details>

#### Gemini API（ニュース要約）
1. [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得

### 4. 手動で動作確認

```bash
npm start
```

`OUTPUT_DIR/YYYY-MM-DD.md` が生成されれば成功です。

## cron で毎日自動実行

`crontab -e` で以下を追加します（例：毎朝 7:00 に実行）。

```cron
0 7 * * * cd /home/megane/dev/obsidian-daily-note-generator && /usr/bin/npm start >> /home/megane/dev/obsidian-daily-note-generator/logs/daily-note.log 2>&1
```

注意点:
- `npm` のフルパスは `which npm` で確認してください。Node を nvm 等で管理している場合はパスが異なります。
- ログ出力先（`logs/` フォルダ）はあらかじめ作成しておくか、cron 起動時に自動作成されるようリダイレクトを調整してください。
- すでに同じ日付の `.md` がある場合はスキップされます（上書きしません）。

## 技術スタック

- Node.js 18+（標準 `fetch` を使用）
- TypeScript（`tsx` で直接実行、ビルド不要）
- dayjs（日付フォーマット）
- @xmldom/xmldom（RSS パース）
- dotenv（環境変数）

## ライセンス

MIT
