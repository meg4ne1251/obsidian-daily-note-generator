interface WeatherResponse {
	weather: { description: string; icon: string }[];
	main: { temp: number; temp_min: number; temp_max: number; humidity: number };
	wind: { speed: number };
	name: string;
}

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

export async function fetchWeather(apiKey: string, city: string): Promise<string> {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return "*OpenWeatherMap API Key が設定されていません。.env で OPENWEATHERMAP_API_KEY を設定してください。*";
	}

	const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(trimmedKey)}&units=metric&lang=ja`;

	const res = await fetch(url);
	if (!res.ok) {
		let apiMessage = "";
		try {
			const err = (await res.json()) as { message?: string };
			if (err?.message) apiMessage = `: ${err.message}`;
		} catch {
			// JSON でなければ無視
		}
		if (res.status === 401) {
			throw new Error(
				`天気API エラー (HTTP 401 Unauthorized)${apiMessage} — ` +
					`API キーが未有効化（発行直後は数時間〜数日かかることがあります）、` +
					`または v3.0 専用キーを v2.5 で使っている可能性があります。` +
					`コピー時に前後の空白が混入していないかもご確認ください。`,
			);
		}
		if (res.status === 404) {
			throw new Error(
				`天気API エラー (HTTP 404)${apiMessage} — ` +
					`都市名「${city}」が見つかりません。英語表記でご確認ください（例: Kawasaki, Tokyo）。`,
			);
		}
		throw new Error(`天気API エラー (HTTP ${res.status})${apiMessage}`);
	}
	const data = (await res.json()) as WeatherResponse;

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
		`| 最低 / 最高 | ${tempMin}℃ / ${tempMax}℃ |`,
		`| 湿度 | ${data.main.humidity}% |`,
		`| 風速 | ${data.wind.speed} m/s |`,
	].join("\n");
}
