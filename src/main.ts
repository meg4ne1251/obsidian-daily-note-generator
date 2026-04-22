import { Plugin, Notice, moment } from "obsidian";
import { DailyNoteGeneratorSettings, DEFAULT_SETTINGS } from "./types";
import { DailyNoteGeneratorSettingTab } from "./settings-tab";
import { fetchWeather } from "./weather";
import { fetchCalendarEvents } from "./calendar";
import { fetchGeneralNews, fetchItNews, fetchInfraNews, NewsResult } from "./news";
import { summarizeWithGemini, NewsCategory } from "./gemini";

export default class DailyNoteGeneratorPlugin extends Plugin {
	settings: DailyNoteGeneratorSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new DailyNoteGeneratorSettingTab(this.app, this));

		this.addRibbonIcon("calendar-plus", "デイリーノートを生成", async () => {
			await this.generateDailyNote();
		});

		this.addCommand({
			id: "generate-daily-note",
			name: "デイリーノートを生成",
			callback: async () => {
				await this.generateDailyNote();
			},
		});

		// 起動時に自動生成（オプション）
		if (this.settings.autoGenerateOnStartup) {
			this.app.workspace.onLayoutReady(async () => {
				const today = moment().format("YYYY-MM-DD");
				const filePath = `${this.settings.noteFolder}/${today}.md`;
				if (!this.app.vault.getAbstractFileByPath(filePath)) {
					await this.generateDailyNote();
				}
			});
		}
	}

	onunload() {
		console.log("Daily Note Generator: unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * デイリーノートを生成するメイン処理
	 */
	async generateDailyNote() {
		const today = moment();
		const dateStr = today.format("YYYY-MM-DD");
		const displayDate = today.format("YYYY年M月D日（ddd）");

		const folder = this.settings.noteFolder;
		const filePath = `${folder}/${dateStr}.md`;

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			new Notice(`⚠️ ${dateStr}.md は既に存在します`);
			return;
		}

		new Notice("🗓️ デイリーノート生成中...");

		try {
			// 3セクションを並列取得して高速化
			const [weatherSection, calendarSection, newsSection] =
				await Promise.all([
					this.getWeatherSection(),
					this.getCalendarSection(),
					this.getNewsSection(),
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
				"## 📰 昨日のニュース",
				newsSection,
				"",
				"---",
				"",
				"## 📝 メモ",
				"",
				"",
			].join("\n");

			// フォルダが無ければ再帰的に作成
			await this.ensureFolder(folder);

			await this.app.vault.create(filePath, content);
			new Notice(`✅ ${dateStr}.md を生成しました！`);

			// 作成したファイルを開く
			await this.app.workspace.openLinkText(filePath, "", true);
		} catch (error) {
			console.error("Daily Note Generator:", error);
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ デイリーノート生成に失敗しました: ${message}`);
		}
	}

	async ensureFolder(path: string): Promise<void> {
		if (this.app.vault.getAbstractFileByPath(path)) return;
		const parent = path.substring(0, path.lastIndexOf("/"));
		if (parent) {
			await this.ensureFolder(parent);
		}
		await this.app.vault.createFolder(path);
	}

	async getWeatherSection(): Promise<string> {
		try {
			return await fetchWeather(
				this.settings.openWeatherMapApiKey,
				this.settings.weatherCity,
			);
		} catch (error) {
			console.error("Weather fetch failed:", error);
			return "*天気情報の取得に失敗しました*";
		}
	}

	async getCalendarSection(): Promise<string> {
		try {
			return await fetchCalendarEvents(
				this.settings.googleClientId,
				this.settings.googleClientSecret,
				this.settings.googleRefreshToken,
			);
		} catch (error) {
			console.error("Calendar fetch failed:", error);
			return "*カレンダー情報の取得に失敗しました*";
		}
	}

	async getNewsSection(): Promise<string> {
		const [generalSection, itSection, infraSection] = await Promise.all([
			this.getNewsCategorySection("🌐 一般ニュース", "general", fetchGeneralNews),
			this.getNewsCategorySection("💻 IT・技術ニュース", "it", fetchItNews),
			this.getNewsCategorySection("🏗️ インフラ・クラウドニュース", "infra", fetchInfraNews),
		]);

		return [generalSection, "", itSection, "", infraSection].join("\n");
	}

	async getNewsCategorySection(
		title: string,
		category: NewsCategory,
		fetchFn: (maxItems: number) => Promise<NewsResult>,
	): Promise<string> {
		try {
			const result = await fetchFn(20);

			if (result.items.length === 0) {
				return `### ${title}\n*ニュースを取得できませんでした*`;
			}

			const titles = result.items.map((i) => i.title);
			const summary = await summarizeWithGemini(
				this.settings.geminiApiKey,
				titles,
				category,
			);

			const headlineLines = result.items.map(
				(item) => `- [${item.title}](${item.link})`,
			);
			const fallbackNote = result.isFallback
				? "*（昨日の記事が見つからなかったため、最新の記事を表示しています）*\n\n"
				: "";

			return [
				`### ${title}`,
				fallbackNote + "#### AI 要約",
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
}
