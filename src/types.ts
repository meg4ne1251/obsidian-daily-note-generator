// ───────────────────────────────────────────────
// プラグイン設定の型定義
// ───────────────────────────────────────────────

export interface DailyNoteGeneratorSettings {
	// ノート保存先フォルダ（Vault内の相対パス）
	noteFolder: string;

	// OpenWeatherMap
	openWeatherMapApiKey: string;
	weatherCity: string; // 例: "Kawasaki"

	// Google Calendar
	googleClientId: string;
	googleClientSecret: string;
	googleRefreshToken: string;

	// Gemini API
	geminiApiKey: string;

	// 起動時に自動生成
	autoGenerateOnStartup: boolean;
}

export const DEFAULT_SETTINGS: DailyNoteGeneratorSettings = {
	noteFolder: "DailyNotes",
	openWeatherMapApiKey: "",
	weatherCity: "Kawasaki",
	googleClientId: "",
	googleClientSecret: "",
	googleRefreshToken: "",
	geminiApiKey: "",
	autoGenerateOnStartup: false,
};
