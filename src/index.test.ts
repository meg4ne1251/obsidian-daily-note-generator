import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type Settings,
	fileExists,
	generateDailyNote,
	getNewsCategorySection,
	loadSettings,
	toMarkdownLink,
} from "./index.js";
import type { NewsItem } from "./news.js";

const ENV_KEYS = [
	"OUTPUT_DIR",
	"OPENWEATHERMAP_API_KEY",
	"WEATHER_CITY",
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"GOOGLE_REFRESH_TOKEN",
	"GEMINI_API_KEY",
] as const;

let savedEnv: Record<string, string | undefined>;

function baseSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		outputDir: "/tmp/unused",
		openWeatherMapApiKey: "",
		weatherCity: "Kawasaki",
		googleClientId: "",
		googleClientSecret: "",
		googleRefreshToken: "",
		geminiApiKey: "",
		...overrides,
	};
}

beforeEach(() => {
	savedEnv = {};
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) delete process.env[key];
		else process.env[key] = savedEnv[key];
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("loadSettings", () => {
	it("OUTPUT_DIR が未設定なら例外を投げる", () => {
		expect(() => loadSettings()).toThrow(/OUTPUT_DIR/);
	});

	it("OUTPUT_DIR のみ設定時は他項目に既定値を使う", () => {
		process.env.OUTPUT_DIR = "/vault/DailyNotes";
		const settings = loadSettings();
		expect(settings).toEqual({
			outputDir: "/vault/DailyNotes",
			openWeatherMapApiKey: "",
			weatherCity: "Kawasaki",
			googleClientId: "",
			googleClientSecret: "",
			googleRefreshToken: "",
			geminiApiKey: "",
		});
	});

	it("環境変数を読み込む", () => {
		process.env.OUTPUT_DIR = "/vault";
		process.env.OPENWEATHERMAP_API_KEY = "wkey";
		process.env.WEATHER_CITY = "Tokyo";
		process.env.GEMINI_API_KEY = "gkey";
		const settings = loadSettings();
		expect(settings.openWeatherMapApiKey).toBe("wkey");
		expect(settings.weatherCity).toBe("Tokyo");
		expect(settings.geminiApiKey).toBe("gkey");
	});
});

describe("fileExists", () => {
	it("存在するファイルは true、存在しないファイルは false", async () => {
		const dir = await mkdtemp(join(tmpdir(), "dng-exists-"));
		try {
			const path = join(dir, "a.md");
			await writeFile(path, "x");
			expect(await fileExists(path)).toBe(true);
			expect(await fileExists(join(dir, "missing.md"))).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("toMarkdownLink", () => {
	it("通常のタイトルとリンクはそのまま整形する", () => {
		expect(toMarkdownLink("普通の記事", "https://e.com/1")).toBe(
			"[普通の記事](https://e.com/1)",
		);
	});

	it("タイトル内の角括弧をエスケープして Obsidian のウィキリンク誤認を防ぐ", () => {
		expect(toMarkdownLink("[AI] 開発環境", "https://e.com/1")).toBe(
			"[\\[AI\\] 開発環境](https://e.com/1)",
		);
	});

	it("URL 内の空白と丸括弧をエンコードしてリンクの早期終了を防ぐ", () => {
		expect(toMarkdownLink("記事", "https://e.com/a_(1)_b")).toBe(
			"[記事](https://e.com/a_%281%29_b)",
		);
	});
});

describe("getNewsCategorySection", () => {
	it("取得件数が 0 なら『取得できませんでした』を返す", async () => {
		const section = await getNewsCategorySection(
			baseSettings(),
			"🌐 一般ニュース",
			"general",
			async () => [],
		);
		expect(section).toBe("### 🌐 一般ニュース\n*ニュースを取得できませんでした*");
	});

	it("見出し一覧をソース・ブックマーク数つきリンクで整形し、AI 要約を挟む", async () => {
		const items: NewsItem[] = [
			{
				title: "K8s の話",
				link: "https://h.com/1",
				pubDate: "",
				source: "はてブ",
				bookmarkCount: 200,
			},
			{ title: "Yの話", link: "https://y.com/1", pubDate: "", source: "Yahoo!" },
		];

		// geminiApiKey 空 → summarize はネットワークなしで案内文を返すため決定的。
		const section = await getNewsCategorySection(
			baseSettings(),
			"💻 IT・技術ニュース",
			"it",
			async () => items,
		);

		expect(section).toContain("### 💻 IT・技術ニュース");
		expect(section).toContain("#### AI 要約");
		expect(section).toContain("#### 見出し一覧");
		expect(section).toContain("- [K8s の話](https://h.com/1) `はてブ` 🔖200");
		expect(section).toContain("- [Yの話](https://y.com/1) `Yahoo!`");
	});

	it("fetchFn が例外を投げたら『取得に失敗しました』を返す", async () => {
		const section = await getNewsCategorySection(
			baseSettings(),
			"🏗️ インフラ",
			"infra",
			async () => {
				throw new Error("boom");
			},
		);
		expect(section).toBe("### 🏗️ インフラ\n*取得に失敗しました*");
	});
});

describe("generateDailyNote", () => {
	let outDir: string;

	beforeEach(async () => {
		outDir = await mkdtemp(join(tmpdir(), "dng-note-"));
		process.env.OUTPUT_DIR = outDir;
		// 天気・カレンダーはキー未設定で fetch せず案内文を返す。
		// ニュースは fetch を行うため、ネットワークを遮断して決定的にする。
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network disabled in test");
			}),
		);
	});

	afterEach(async () => {
		await rm(outDir, { recursive: true, force: true });
	});

	it("当日分のノートを生成し、各セクションを含む", async () => {
		await generateDailyNote();

		// ノートは OUTPUT_DIR/YYYY/MM/ 配下に保存される。
		const noteDir = join(outDir, dayjs().format("YYYY"), dayjs().format("MM"));
		const files = await readdir(noteDir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);

		const content = await readFile(join(noteDir, files[0]), "utf-8");

		expect(content).toContain(dayjs().format("YYYY年M月D日"));
		expect(content).toContain("## 🌤️ 天気");
		expect(content).toContain("OpenWeatherMap API Key が設定されていません");
		expect(content).toContain("## 📅 今日の予定");
		expect(content).toContain("Google カレンダーの認証情報が設定されていません");
		expect(content).toContain("## 📰 注目ニュース");
		expect(content).toContain("### 🌐 一般ニュース");
		expect(content).toContain("### 💻 IT・技術ニュース");
		expect(content).toContain("### 🏗️ インフラ・クラウドニュース");
		expect(content).toContain("## 📝 メモ");
	});

	it("既にファイルが存在する日は上書きせずスキップする", async () => {
		const today = dayjs();
		const noteDir = join(outDir, today.format("YYYY"), today.format("MM"));
		await mkdir(noteDir, { recursive: true });
		const path = join(noteDir, `${today.format("YYYY-MM-DD")}.md`);
		await writeFile(path, "既存の内容", "utf-8");

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await generateDailyNote();

		expect(await readFile(path, "utf-8")).toBe("既存の内容");
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("スキップ"));
	});
});
