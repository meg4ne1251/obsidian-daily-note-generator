import { requestUrl } from "obsidian";

// OpenWeatherMap API レスポンスの必要な部分のみ型定義
interface WeatherResponse {
	weather: { description: string; icon: string }[];
	main: { temp: number; temp_min: number; temp_max: number; humidity: number };
	wind: { speed: number };
	name: string;
}

// 天気アイコンコード → 絵文字のマッピング
const WEATHER_EMOJI: Record<string, string> = {
	"01d": "☀️", "01n": "🌙",
	"02d": "⛅", "02n": "☁️",
	"03d": "☁️", "03n": "☁️",
	"04d": "☁️", "04n": "☁️",
	"09d": "🌧️", "09n": "🌧️",
	"10d": "🌦️", "10n": "🌧️",
	"11d": "⛈️", "11n": "⛈️",
	"13d": "🌨️", "13n": "🌨️",
	"50d": "🌫️", "50n": "🌫️",
};

/**
 * OpenWeatherMap API から現在の天気を取得し、Markdown テキストを返す
 */
export async function fetchWeather(apiKey: string, city: string): Promise<string> {
	if (!apiKey) {
		return "*OpenWeatherMap API Key が設定されていません。設定画面で入力してください。*";
	}

	const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ja`;

	const res = await requestUrl({ url });
	if (res.status !== 200) {
		throw new Error(`天気API エラー (HTTP ${res.status})`);
	}
	const data: WeatherResponse = res.json;

	const weather = data.weather[0];
	const emoji = WEATHER_EMOJI[weather.icon] ?? "🌤️";
	const temp = Math.round(data.main.temp);
	const tempMin = Math.round(data.main.temp_min);
	const tempMax = Math.round(data.main.temp_max);

	return [
		`${emoji} **${weather.description}**（${data.name}）`,
		"",
		`| 項目 | 値 |`,
		`| --- | --- |`,
		`| 気温 | ${temp}℃ |`,
		`| 体感最低 / 最高 | ${tempMin}℃ / ${tempMax}℃ |`,
		`| 湿度 | ${data.main.humidity}% |`,
		`| 風速 | ${data.wind.speed} m/s |`,
	].join("\n");
}
