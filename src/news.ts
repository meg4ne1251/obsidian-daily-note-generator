import { requestUrl, moment } from "obsidian";

export interface NewsItem {
	title: string;
	link: string;
	pubDate: string;
}

/**
 * NHK News Web の主要ニュース RSS から昨日のニュースを取得
 * RSS URL: https://www3.nhk.or.jp/rss/news/cat0.xml
 *
 * 注: かつての https://www.nhk.or.jp/rss/news/cat0.xml は 301 リダイレクトで
 * 内部ホスト名 (news.web.nhk) に飛ばされ、一部環境で解決できず 404/失敗する。
 * www3.nhk.or.jp は直接 200 を返す公式の RSS エンドポイント。
 */
export interface NhkNewsResult {
	items: NewsItem[];
	isFallback: boolean;
}

export async function fetchNhkNews(maxItems: number = 5): Promise<NhkNewsResult> {
	const res = await requestUrl({
		url: "https://www3.nhk.or.jp/rss/news/cat0.xml",
		throw: false,
	});
	if (res.status !== 200) {
		throw new Error(`NHKニュースRSS取得エラー (HTTP ${res.status})`);
	}

	const xml = res.text;
	const items = parseRssItems(xml);

	// 昨日の日付でフィルタ
	const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
	const filtered = items.filter((item) => {
		const itemDate = moment(item.pubDate).format("YYYY-MM-DD");
		return itemDate === yesterday;
	});

	// 昨日のニュースが無い場合は最新のものを返す
	if (filtered.length > 0) {
		return { items: filtered.slice(0, maxItems), isFallback: false };
	}
	return { items: items.slice(0, maxItems), isFallback: true };
}

/**
 * RSS XML をパースして NewsItem 配列に変換
 * Obsidian 環境では DOMParser が利用可能
 */
function parseRssItems(xml: string): NewsItem[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "text/xml");
	const items = doc.querySelectorAll("item");

	const result: NewsItem[] = [];
	items.forEach((item) => {
		const title = item.querySelector("title")?.textContent ?? "";
		const link = item.querySelector("link")?.textContent ?? "";
		const pubDate = item.querySelector("pubDate")?.textContent ?? "";
		if (title) {
			result.push({ title, link, pubDate });
		}
	});

	return result;
}
