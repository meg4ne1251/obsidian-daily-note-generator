import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import dayjs from "dayjs";
import "dayjs/locale/ja.js";
import { config as loadDotenv } from "dotenv";

import { fetchWeather } from "./weather.js";
import { fetchCalendarEvents } from "./calendar.js";
import {
	fetchGeneralNews,
	fetchItNews,
	fetchInfraNews,
	formatRelativeTime,
	type NewsItem,
} from "./news.js";
import { summarizeWithGemini, type NewsCategory } from "./gemini.js";

loadDotenv();
dayjs.locale("ja");

export interface Settings {
	outputDir: string;
	openWeatherMapApiKey: string;
	weatherCity: string;
	googleClientId: string;
	googleClientSecret: string;
	googleRefreshToken: string;
	geminiApiKey: string;
}

export function loadSettings(): Settings {
	const outputDir = process.env.OUTPUT_DIR;
	if (!outputDir) {
		throw new Error(
			"環境変数 OUTPUT_DIR が設定されていません。.env で OUTPUT_DIR=/path/to/vault/DailyNotes のように指定してください。",
		);
	}
	return {
		outputDir,
		openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY ?? "",
		weatherCity: process.env.WEATHER_CITY ?? "Kawasaki",
		googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
		googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
		geminiApiKey: process.env.GEMINI_API_KEY ?? "",
	};
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function getWeatherSection(settings: Settings): Promise<string> {
	try {
		return await fetchWeather(settings.openWeatherMapApiKey, settings.weatherCity);
	} catch (error) {
		console.error("Weather fetch failed:", error);
		return "*天気情報の取得に失敗しました*";
	}
}

async function getCalendarSection(settings: Settings): Promise<string> {
	try {
		return await fetchCalendarEvents(
			settings.googleClientId,
			settings.googleClientSecret,
			settings.googleRefreshToken,
		);
	} catch (error) {
		console.error("Calendar fetch failed:", error);
		return "*カレンダー情報の取得に失敗しました*";
	}
}

// ニュースタイトルには ASCII の角括弧（例: "[AI] ..."）が含まれることがある。
// そのまま `[title](url)` に埋め込むと、Obsidian では `[[` がウィキリンクとして
// 解釈され、CommonMark でも括弧の対応が崩れてリンクが壊れる。リンクテキスト内の
// `[` `]` をエスケープし、URL 内の空白・`)` を百分率エンコードして防ぐ。
export function toMarkdownLink(title: string, link: string): string {
	const safeTitle = title.replace(/[[\]]/g, (c) => `\\${c}`);
	// 空白・丸括弧は CommonMark のインラインリンク終端や対応崩れを招くため
	// 百分率エンコードする（既にエンコード済みの URL に対しても冪等）。
	const safeLink = link
		.replace(/ /g, "%20")
		.replace(/\(/g, "%28")
		.replace(/\)/g, "%29");
	return `[${safeTitle}](${safeLink})`;
}

export async function getNewsCategorySection(
	settings: Settings,
	title: string,
	category: NewsCategory,
	fetchFn: (maxItems: number) => Promise<NewsItem[]>,
): Promise<string> {
	try {
		const items = await fetchFn(20);

		if (items.length === 0) {
			return `### ${title}\n*ニュースを取得できませんでした*`;
		}

		const now = new Date();

		// Gemini には「いつ・どれくらい話題か」を判断させたいので、タイトルだけでなく
		// ソース・ブックマーク数・経過時間を括弧で添えて渡す。
		const summaryInput = items.map((item) => {
			const meta: string[] = [];
			if (item.source) meta.push(item.source);
			if (typeof item.bookmarkCount === "number") {
				meta.push(`🔖${item.bookmarkCount}`);
			}
			const age = formatRelativeTime(item.pubDate, now);
			if (age) meta.push(age);
			return meta.length > 0 ? `${item.title}（${meta.join(" / ")}）` : item.title;
		});
		const summary = await summarizeWithGemini(
			settings.geminiApiKey,
			summaryInput,
			category,
		);

		const headlineLines = items.map((item) => {
			const source = item.source ? ` \`${item.source}\`` : "";
			const count =
				typeof item.bookmarkCount === "number"
					? ` 🔖${item.bookmarkCount}`
					: "";
			const age = formatRelativeTime(item.pubDate, now);
			const ageStr = age ? ` 🕒${age}` : "";
			return `- ${toMarkdownLink(item.title, item.link)}${source}${count}${ageStr}`;
		});

		return [
			`### ${title}`,
			"#### AI 要約",
			summary,
			"",
			"#### 見出し一覧",
			...headlineLines,
		].join("\n");
	} catch (error) {
		console.error(`${title} fetch failed:`, error);
		return `### ${title}\n*取得に失敗しました*`;
	}
}

async function getNewsSection(settings: Settings): Promise<string> {
	const [generalSection, itSection, infraSection] = await Promise.all([
		getNewsCategorySection(settings, "🌐 一般ニュース", "general", fetchGeneralNews),
		getNewsCategorySection(settings, "💻 IT・技術ニュース", "it", fetchItNews),
		getNewsCategorySection(settings, "🏗️ インフラ・クラウドニュース", "infra", fetchInfraNews),
	]);

	return [generalSection, "", itSection, "", infraSection].join("\n");
}

export async function generateDailyNote(): Promise<void> {
	const settings = loadSettings();

	const today = dayjs();
	const dateStr = today.format("YYYY-MM-DD");
	const yearStr = today.format("YYYY");
	const monthStr = today.format("MM");
	const displayDate = today.format("YYYY年M月D日（ddd）");

	// 年・月のサブディレクトリに分けて保存する（例: OUTPUT_DIR/2026/06/2026-06-01.md）。
	// 中間ディレクトリは後続の mkdir({ recursive: true }) で自動生成される。
	const filePath = `${settings.outputDir}/${yearStr}/${monthStr}/${dateStr}.md`;

	if (await fileExists(filePath)) {
		console.log(`⚠️  ${filePath} は既に存在します。スキップします。`);
		return;
	}

	console.log("🗓️  デイリーノート生成中...");

	const [weatherSection, calendarSection, newsSection] = await Promise.all([
		getWeatherSection(settings),
		getCalendarSection(settings),
		getNewsSection(settings),
	]);

	const content = [
		`# ${displayDate}`,
		"",
		"## 🌤️ 天気",
		weatherSection,
		"",
		"## 📅 今日の予定",
		calendarSection,
		"",
		"## 📰 注目ニュース",
		newsSection,
		"",
		"---",
		"",
		"## 📝 メモ",
		"",
		"",
	].join("\n");

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf-8");

	console.log(`✅ ${filePath} を生成しました！`);
}

// このファイルが直接実行された場合（npm start / tsx src/index.ts）のみ生成を走らせる。
// テストから import したときは副作用で実行されないようにする。
const invokedDirectly =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
	generateDailyNote().catch((error) => {
		console.error("❌ デイリーノート生成に失敗しました:", error);
		process.exit(1);
	});
}
