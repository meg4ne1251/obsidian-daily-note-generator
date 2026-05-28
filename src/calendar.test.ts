import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCalendarEvents } from "./calendar.js";

const TOKEN_URL = "oauth2.googleapis.com/token";
const EVENTS_URL = "www.googleapis.com/calendar";

interface CalendarEvent {
	summary?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	location?: string;
}

/** トークン取得 → 予定取得 の2回の fetch をモックする。 */
function stubCalendar(options: {
	tokenStatus?: number;
	eventsStatus?: number;
	events?: CalendarEvent[];
}): ReturnType<typeof vi.fn> {
	const { tokenStatus = 200, eventsStatus = 200, events = [] } = options;
	const mock = vi.fn(async (input: string | URL) => {
		const url = input.toString();
		if (url.includes(TOKEN_URL)) {
			return new Response(JSON.stringify({ access_token: "tok-123" }), {
				status: tokenStatus,
			});
		}
		if (url.includes(EVENTS_URL)) {
			return new Response(JSON.stringify({ items: events }), {
				status: eventsStatus,
			});
		}
		throw new Error(`unmocked URL: ${url}`);
	});
	vi.stubGlobal("fetch", mock);
	return mock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("fetchCalendarEvents", () => {
	it("認証情報が欠けていれば fetch せず案内メッセージを返す", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const result = await fetchCalendarEvents("id", "secret", "");
		expect(result).toContain("Google カレンダーの認証情報が設定されていません");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("トークン取得 → 予定取得の順で正しいリクエストを送る", async () => {
		const mock = stubCalendar({
			events: [
				{
					summary: "会議",
					start: { dateTime: "2026-05-28T09:30:00+09:00" },
					end: { dateTime: "2026-05-28T10:30:00+09:00" },
				},
			],
		});

		await fetchCalendarEvents("cid", "csec", "rtok");

		// 1回目: トークンリクエスト
		const [tokenUrl, tokenInit] = mock.mock.calls[0];
		expect(String(tokenUrl)).toContain(TOKEN_URL);
		expect(tokenInit?.method).toBe("POST");
		expect(String(tokenInit?.body)).toContain("grant_type=refresh_token");
		expect(String(tokenInit?.body)).toContain("refresh_token=rtok");

		// 2回目: 予定リクエスト（取得したトークンを Bearer に載せる）
		const [eventsUrl, eventsInit] = mock.mock.calls[1];
		expect(String(eventsUrl)).toContain("singleEvents=true");
		expect(String(eventsUrl)).toContain("orderBy=startTime");
		expect(
			(eventsInit?.headers as Record<string, string>).Authorization,
		).toBe("Bearer tok-123");
	});

	it("時刻つきの予定を 開始〜終了 で整形する", async () => {
		stubCalendar({
			events: [
				{
					summary: "会議",
					start: { dateTime: "2026-05-28T09:30:00+09:00" },
					end: { dateTime: "2026-05-28T10:30:00+09:00" },
					location: "会議室A",
				},
			],
		});

		const result = await fetchCalendarEvents("cid", "csec", "rtok");
		expect(result).toBe("- 🕐 09:30〜10:30 **会議** 📍 会議室A");
	});

	it("終了時刻が無い予定は開始時刻のみ表示する", async () => {
		stubCalendar({
			events: [{ summary: "単発", start: { dateTime: "2026-05-28T14:00:00+09:00" }, end: {} }],
		});

		const result = await fetchCalendarEvents("cid", "csec", "rtok");
		expect(result).toBe("- 🕐 14:00 **単発**");
	});

	it("終日予定（date 指定）は『終日』と表示する", async () => {
		stubCalendar({
			events: [{ summary: "祝日", start: { date: "2026-05-28" }, end: { date: "2026-05-29" } }],
		});

		const result = await fetchCalendarEvents("cid", "csec", "rtok");
		expect(result).toBe("- 🕐 終日 **祝日**");
	});

	it("タイトルが無い予定は『（タイトルなし）』になる", async () => {
		stubCalendar({
			events: [{ start: { dateTime: "2026-05-28T08:00:00+09:00" }, end: {} }],
		});

		const result = await fetchCalendarEvents("cid", "csec", "rtok");
		expect(result).toContain("**（タイトルなし）**");
	});

	it("予定が無ければ専用メッセージを返す", async () => {
		stubCalendar({ events: [] });
		const result = await fetchCalendarEvents("cid", "csec", "rtok");
		expect(result).toBe("*今日の予定はありません 🎉*");
	});

	it("トークン取得が失敗したら例外を投げる", async () => {
		stubCalendar({ tokenStatus: 400 });
		await expect(fetchCalendarEvents("cid", "csec", "rtok")).rejects.toThrow(
			/OAuth トークン取得エラー.*400/s,
		);
	});

	it("予定取得が失敗したら例外を投げる", async () => {
		stubCalendar({ eventsStatus: 403 });
		await expect(fetchCalendarEvents("cid", "csec", "rtok")).rejects.toThrow(
			/Calendar API エラー.*403/s,
		);
	});
});
