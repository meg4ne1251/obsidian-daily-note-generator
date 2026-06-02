# Daily Note Generator

天気・Googleカレンダー・ニュース要約を含むデイリーノート（Markdown）を **cron で自動生成** するスクリプトです。Obsidian には干渉せず、指定したディレクトリに `.md` ファイルを置くだけのシンプルな構成です。

## 機能

- 🌤️ **天気**（OpenWeatherMap API） — 指定都市の気温・体感温度・湿度・風速をテーブル表示
- 📅 **Googleカレンダーの予定** — 今日のイベントを時系列で一覧表示
- 📰 **注目ニュース** — Yahoo!・はてブ（総合/IT）・Google トレンド(JP)・GIGAZINE・Qiita・Zenn・Publickey・Google News から3カテゴリ（国内トレンド / IT・技術 / インフラ・クラウド）を取得。**直近48時間**に絞り込み、**鮮度＋話題度（ブックマーク数など）でランク付け**したうえで Gemini API が日本語要約。トレンドは**日本国内**にフォーカス

### ニュースの選定ロジック

「その日・前日に日本で話題になったトピック」に追従するため、各カテゴリで以下の順に処理します。

1. **収集** — カテゴリごとの複数フィードを並列取得（1つ失敗しても他は継続）
   - **🗾 国内トレンド** — Yahoo!トップピックス＋はてブ総合（人気エントリー）＋Google トレンド(JP)。はてブ総合の実ブックマーク数が「日本でどれだけ読まれているか」の指標になります
   - **💻 IT・技術** — GIGAZINE＋はてブIT＋Qiita＋Zenn＋Publickey＋Google News
   - **🏗️ インフラ・クラウド** — 上記ITソースをインフラ関連語で絞り込み＋Google News
2. **鮮度フィルタ** — 公開から48時間以内の記事だけ残す（`RECENT_WINDOW_HOURS`）
3. **重複排除** — 同一リンクは1件に集約
4. **話題度ランキング** — `鮮度スコア` と `話題度スコア`（はてブのブックマーク数 → 正規化、無い場合はソース種別の代理値）を半々で合成し、**優先ソースの加点**（`SOURCE_PRIORITY_BOOST`）を上乗せして降順に並べる
5. **AI要約** — 上位を Gemini に渡し、ソース・ブックマーク数・経過時間も添えて「本日・昨日に話題のトピック優先」で5件要約

#### チューニングのつまみ（`src/news.ts`）

- **GIGAZINE の優先度** — `SOURCE_PRIORITY_BOOST.GIGAZINE`（既定 `0.25`）でスコアを底上げし、IT セクションの上位に出します。値を上げるほど強く優先。更新頻度が高くセクションを占有しないよう、取り込み件数は `fetchItNews` 内の `gigazine.slice(0, 4)` で制限しています
- **Google トレンドの重み** — 検索急上昇は芸能・ゴシップに偏りがちなため、代理話題度 `SOURCE_BUZZ_BASELINE["Google Trends"]` を `0.7` に抑え、実ブックマーク数を持つ国内ニュースが埋もれないようにしています
- **対象国** — 現在は日本(JP)のみ。「世界のトレンド」も拾いたくなったら `GOOGLE_TRENDS_FEEDS` に `{ geo: "US", source: "Google Trends(世界)" }` を追加すれば対象国を増やせます

## 生成されるノートの例

```markdown
# 2026年5月25日（月）

## 🌤️ 天気
☀️ **晴天**（Kawasaki）

| 項目 | 値 |
| --- | --- |
| 気温 | 18℃ |
| 体感温度 | 17℃ |
| 湿度 | 55% |
| 風速 | 3.2 m/s |

## 📅 今日の予定
- 🕐 09:00〜10:00 **チームミーティング** 📍 会議室A

## 📰 注目ニュース
### 🗾 国内トレンド・ニュース
#### AI 要約
- ...

#### 見出し一覧
- [タイトル](https://...) `はてブ` 🔖320 🕒6時間前

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

`OUTPUT_DIR/YYYY/MM/YYYY-MM-DD.md`（例: `OUTPUT_DIR/2026/06/2026-06-01.md`）が生成されれば成功です。

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
