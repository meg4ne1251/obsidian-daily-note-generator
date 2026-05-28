import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWeather } from "./weather.js";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const SUCCESS_BODY = {
	weather: [{ description: "曇りがち", icon: "04d" }],
	main: { temp: 21.4, feels_like: 20.6, humidity: 55 },
	wind: { speed: 3.2 },
	name: "Kawasaki",
};

describe("fetchWeather", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("API キー未設定なら fetch せずに案内メッセージを返す", async () => {
		const result = await fetchWeather("", "Kawasaki");
		expect(result).toContain("OpenWeatherMap API Key が設定されていません");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("空白だけのキーも trim 後に未設定扱いになる", async () => {
		const result = await fetchWeather("   ", "Kawasaki");
		expect(result).toContain("OpenWeatherMap API Key が設定されていません");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("正常系: 気温・体感・湿度・風速を整形し、アイコンを絵文字に変換する", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(SUCCESS_BODY));

		const result = await fetchWeather("KEY", "Kawasaki");

		expect(result).toContain("☁️ **曇りがち**（Kawasaki）");
		expect(result).toContain("| 気温 | 21℃ |"); // round(21.4)
		expect(result).toContain("| 体感温度 | 21℃ |"); // round(20.6)
		expect(result).toContain("| 湿度 | 55% |");
		expect(result).toContain("| 風速 | 3.2 m/s |");
	});

	it("URL に都市名・キー・units=metric・lang=ja を含める（キーは trim される）", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(SUCCESS_BODY));

		await fetchWeather(" KEY ", "New York");

		const url = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(url).toContain("q=New%20York");
		expect(url).toContain("appid=KEY");
		expect(url).toContain("units=metric");
		expect(url).toContain("lang=ja");
	});

	it("未知のアイコンコードはフォールバック絵文字になる", async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse({
				...SUCCESS_BODY,
				weather: [{ description: "謎の天気", icon: "99z" }],
			}),
		);

		const result = await fetchWeather("KEY", "Kawasaki");
		expect(result).toContain("🌤️ **謎の天気**");
	});

	it("weather 配列が空なら例外を投げる", async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse({ ...SUCCESS_BODY, weather: [] }),
		);

		await expect(fetchWeather("KEY", "Kawasaki")).rejects.toThrow(
			/weather 情報が含まれていません/,
		);
	});

	it("401 は未有効化キーの可能性を示す専用メッセージを投げる", async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse({ message: "Invalid API key" }, 401),
		);

		await expect(fetchWeather("KEY", "Kawasaki")).rejects.toThrow(
			/HTTP 401 Unauthorized.*Invalid API key/s,
		);
	});

	it("404 は都市名を含む専用メッセージを投げる", async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse({ message: "city not found" }, 404),
		);

		await expect(fetchWeather("KEY", "Atlantis")).rejects.toThrow(
			/HTTP 404.*Atlantis/s,
		);
	});

	it("その他のステータスは汎用エラーを投げる", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: "boom" }, 500));

		await expect(fetchWeather("KEY", "Kawasaki")).rejects.toThrow(
			/HTTP 500.*boom/s,
		);
	});

	it("エラー応答が JSON でなくてもクラッシュせずエラーを投げる", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response("Service Unavailable", { status: 503 }),
		);

		await expect(fetchWeather("KEY", "Kawasaki")).rejects.toThrow(/HTTP 503/);
	});
});
