import dayjs from "dayjs";

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

async function getAccessToken(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<string> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId.trim(),
			client_secret: clientSecret.trim(),
			refresh_token: refreshToken.trim(),
			grant_type: "refresh_token",
		}).toString(),
	});
	if (!res.ok) {
		throw new Error(`Google OAuth トークン取得エラー (HTTP ${res.status})`);
	}
	const data = (await res.json()) as TokenResponse;
	return data.access_token;
}

export async function fetchCalendarEvents(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<string> {
	if (!clientId || !clientSecret || !refreshToken) {
		return "*Google カレンダーの認証情報が設定されていません。.env で GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN を設定してください。*";
	}

	const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

	const todayStart = dayjs().startOf("day").toISOString();
	const todayEnd = dayjs().endOf("day").toISOString();

	const params = new URLSearchParams({
		timeMin: todayStart,
		timeMax: todayEnd,
		singleEvents: "true",
		orderBy: "startTime",
	});

	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);
	if (!res.ok) {
		throw new Error(`Google Calendar API エラー (HTTP ${res.status})`);
	}

	const data = (await res.json()) as CalendarListResponse;
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

function formatEventTime(ev: CalendarEvent): string {
	if (ev.start.date || !ev.start.dateTime) {
		return "🕐 終日";
	}
	const start = dayjs(ev.start.dateTime).format("HH:mm");
	const end = ev.end.dateTime ? dayjs(ev.end.dateTime).format("HH:mm") : "";
	return end ? `🕐 ${start}〜${end}` : `🕐 ${start}`;
}
