import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DailyNoteGeneratorPlugin from "./main";
import { fetchWeather } from "./weather";
import { fetchCalendarEvents } from "./calendar";
import { fetchGeneralNews } from "./news";
import { summarizeWithGemini } from "./gemini";

export class DailyNoteGeneratorSettingTab extends PluginSettingTab {
	plugin: DailyNoteGeneratorPlugin;

	constructor(app: App, plugin: DailyNoteGeneratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── 一般設定 ──
		new Setting(containerEl)
			.setName("ノート保存先フォルダ")
			.setDesc("デイリーノートを保存するフォルダ（Vault内の相対パス）")
			.addText((text) =>
				text
					.setPlaceholder("DailyNotes")
					.setValue(this.plugin.settings.noteFolder)
					.onChange(async (value) => {
						this.plugin.settings.noteFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("起動時に自動生成")
			.setDesc("Obsidian 起動時に、その日のデイリーノートが無ければ自動生成する（次回起動時から有効）")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoGenerateOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerateOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		// ── 天気（OpenWeatherMap） ──
		containerEl.createEl("h3", { text: "🌤️ 天気設定" });

		new Setting(containerEl)
			.setName("OpenWeatherMap API Key")
			.setDesc("openweathermap.org で取得した API キー")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("API Key を入力")
					.setValue(this.plugin.settings.openWeatherMapApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openWeatherMapApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("都市名")
			.setDesc("天気を取得する都市（英語名）")
			.addText((text) =>
				text
					.setPlaceholder("Kawasaki")
					.setValue(this.plugin.settings.weatherCity)
					.onChange(async (value) => {
						this.plugin.settings.weatherCity = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("天気 API テスト")
			.setDesc("設定した API キーと都市名で天気を取得できるかテスト")
			.addButton((btn) =>
				btn.setButtonText("テスト").onClick(async () => {
					try {
						new Notice("🌤️ 天気 API をテスト中...");
						const result = await fetchWeather(
							this.plugin.settings.openWeatherMapApiKey,
							this.plugin.settings.weatherCity,
						);
						new Notice(`✅ 天気取得成功！\n${result.slice(0, 100)}`);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(`❌ 天気取得失敗: ${msg}`);
					}
				})
			);

		// ── Google カレンダー ──
		containerEl.createEl("h3", { text: "📅 Google カレンダー設定" });

		new Setting(containerEl)
			.setName("Google Client ID")
			.setDesc("Google Cloud Console で取得した OAuth クライアント ID")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Client ID を入力")
					.setValue(this.plugin.settings.googleClientId)
					.onChange(async (value) => {
						this.plugin.settings.googleClientId = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Google Client Secret")
			.setDesc("OAuth クライアントシークレット")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Client Secret を入力")
					.setValue(this.plugin.settings.googleClientSecret)
					.onChange(async (value) => {
						this.plugin.settings.googleClientSecret = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Google Refresh Token")
			.setDesc("OAuth で取得したリフレッシュトークン")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Refresh Token を入力")
					.setValue(this.plugin.settings.googleRefreshToken)
					.onChange(async (value) => {
						this.plugin.settings.googleRefreshToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("カレンダー API テスト")
			.setDesc("Google カレンダーに接続できるかテスト")
			.addButton((btn) =>
				btn.setButtonText("テスト").onClick(async () => {
					try {
						new Notice("📅 カレンダー API をテスト中...");
						const result = await fetchCalendarEvents(
							this.plugin.settings.googleClientId,
							this.plugin.settings.googleClientSecret,
							this.plugin.settings.googleRefreshToken,
						);
						new Notice(`✅ カレンダー取得成功！\n${result.slice(0, 100)}`);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(`❌ カレンダー取得失敗: ${msg}`);
					}
				})
			);

		// ── Gemini API ──
		containerEl.createEl("h3", { text: "📰 ニュース要約設定" });

		new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Google AI Studio で取得した Gemini API キー")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("API Key を入力")
					.setValue(this.plugin.settings.geminiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("ニュース + AI 要約テスト")
			.setDesc("NHK ニュース取得と Gemini 要約が動作するかテスト")
			.addButton((btn) =>
				btn.setButtonText("テスト").onClick(async () => {
					try {
						new Notice("📰 ニュース API をテスト中...");
						const { items } = await fetchGeneralNews(3);
						if (items.length === 0) {
							new Notice("⚠️ ニュースが取得できませんでした");
							return;
						}
						new Notice(`✅ ニュース ${items.length} 件取得！Gemini で要約中...`);
						const titles = items.map((i) => i.title);
						const summary = await summarizeWithGemini(
							this.plugin.settings.geminiApiKey,
							titles,
						);
						new Notice(`✅ AI 要約成功！\n${summary.slice(0, 100)}`);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(`❌ ニュース/要約失敗: ${msg}`);
					}
				})
			);
	}
}
