import { Plugin, Notice } from "obsidian";

// ───────────────────────────────────────────────
// Daily Note Generator プラグイン
// Step 1: 最小限の動作確認用ひな形
// ───────────────────────────────────────────────

export default class DailyNoteGeneratorPlugin extends Plugin {

	/**
	 * プラグイン有効化時に呼ばれる
	 */
	async onload() {
		console.log("Daily Note Generator: loaded");

		// リボンアイコン（左サイドバー）にボタンを追加
		// クリックするとデイリーノートを生成する（今は通知だけ）
		this.addRibbonIcon("calendar-plus", "デイリーノートを生成", async () => {
			new Notice("🗓️ デイリーノート生成ボタンが押されました！");
		});

		// コマンドパレットにも登録
		this.addCommand({
			id: "generate-daily-note",
			name: "デイリーノートを生成",
			callback: async () => {
				new Notice("🗓️ デイリーノート生成コマンドが実行されました！");
			},
		});
	}

	/**
	 * プラグイン無効化時に呼ばれる
	 */
	onunload() {
		console.log("Daily Note Generator: unloaded");
	}
}
