import { requestUrl, moment } from "obsidian";

export interface NewsItem {
	title: string;
	link: string;
	pubDate: string;
}

/**
 * NHK News Web の主要ニュース RSS から昨日のニュースを取得
 * RSS URL: https://www.nhk.or.jp/rss/news/cat0.xml
 */
export async function fetchNhkNews(maxItems: number = 5): Promise<NewsItem[]> {
	const res = await requestUrl({
		url: "https://www.nhk.or.jp/rss/news/cat0.xml",
	});

	const xml = res.text;
	const items = parseRssItems(xml);

	// 昨日の日付でフィルタ
	const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
	const filtered = items.filter((item) => {
		const itemDate = moment(item.pubDate).format("YYYY-MM-DD");
		return itemDate === yesterday;
	});

	// 昨日のニュースが無い場合は最新のものを返す
	const result = filtered.length > 0 ? filtered : items;
	return result.slice(0, maxItems);
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
