import { requestUrl, moment } from "obsidian";

interface TokenResponse {
	access_token: string;
}

interface CalendarEvent {
	summary?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	location?: string;
}

interface CalendarListResponse {
	items?: CalendarEvent[];
}

/**
 * Refresh Token を使って Access Token を取得
 */
async function getAccessToken(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<string> {
	const res = await requestUrl({
		url: "https://oauth2.googleapis.com/token",
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}).toString(),
	});
	if (res.status !== 200) {
		throw new Error(`Google OAuth トークン取得エラー (HTTP ${res.status})`);
	}
	const data: TokenResponse = res.json;
	return data.access_token;
}

/**
 * Google Calendar API から今日のイベントを取得し、Markdown テキストを返す
 */
export async function fetchCalendarEvents(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<string> {
	if (!clientId || !clientSecret || !refreshToken) {
		return "*Google カレンダーの認証情報が設定されていません。設定画面で入力してください。*";
	}

	const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

	// 今日の 00:00 〜 23:59 を取得範囲にする
	const todayStart = moment().startOf("day").toISOString();
	const todayEnd = moment().endOf("day").toISOString();

	const params = new URLSearchParams({
		timeMin: todayStart,
		timeMax: todayEnd,
		singleEvents: "true",
		orderBy: "startTime",
	});

	const res = await requestUrl({
		url: `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (res.status !== 200) {
		throw new Error(`Google Calendar API エラー (HTTP ${res.status})`);
	}

	const data: CalendarListResponse = res.json;
	const events = data.items ?? [];

	if (events.length === 0) {
		return "*今日の予定はありません 🎉*";
	}

	const lines = events.map((ev) => {
		const timeStr = formatEventTime(ev);
		const summary = ev.summary ?? "（タイトルなし）";
		const location = ev.location ? ` 📍 ${ev.location}` : "";
		return `- ${timeStr} **${summary}**${location}`;
	});

	return lines.join("\n");
}

/**
 * イベントの時間を "HH:mm〜HH:mm" 形式にフォーマット
 * 終日イベントの場合は "終日" と表示
 */
function formatEventTime(ev: CalendarEvent): string {
	if (ev.start.date) {
		return "🕐 終日";
	}
	const start = moment(ev.start.dateTime).format("HH:mm");
	const end = moment(ev.end.dateTime).format("HH:mm");
	return `🕐 ${start}〜${end}`;
}
