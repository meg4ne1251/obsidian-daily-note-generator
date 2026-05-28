import { defineConfig } from "vitest/config";

// ソースコードは ESM の慣習に従い相対 import を ".js" 拡張子で書いている
// （実体は .ts）。tsx は解決できるが Vite/Vitest は既定では ".js" を ".ts" に
// フォールバックしないため、明示的に解決するプラグインを差し込む。
const resolveJsToTs = {
	name: "resolve-js-to-ts",
	enforce: "pre" as const,
	async resolveId(source: string, importer: string | undefined) {
		if (importer && source.startsWith(".") && source.endsWith(".js")) {
			const tsSource = `${source.slice(0, -3)}.ts`;
			const resolved = await this.resolve(tsSource, importer, {
				skipSelf: true,
			});
			if (resolved) return resolved;
		}
		return null;
	},
};

export default defineConfig({
	plugins: [resolveJsToTs],
	test: {
		// calendar.ts / index.ts は dayjs でローカル時刻を整形するため、
		// マシンの TZ に依存せず再現するよう日本時間に固定する。
		env: { TZ: "Asia/Tokyo" },
		include: ["src/**/*.test.ts"],
	},
});
