import { requestUrl, moment } from "obsidian";

export interface NewsItem {
	title: string;
	link: string;
	pubDate: string;
}

export interface NewsResult {
	items: NewsItem[];
	isFallback: boolean;
}

const GOOGLE_NEWS_BASE = "https://news.google.com/rss";

/**
 * Google News RSS をフェッチして昨日の記事を返す共通処理
 * 昨日の記事がなければ最新記事をフォールバックとして返す
 */
async function fetchGoogleNewsRss(
	url: string,
	maxItems: number,
): Promise<NewsResult> {
	const res = await requestUrl({ url, throw: false });
	if (res.status !== 200) {
		throw new Error(`ニュースRSS取得エラー (HTTP ${res.status})`);
	}

	const items = parseRssItems(res.text);
	const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
	const filtered = items.filter(
		(item) => moment(item.pubDate).format("YYYY-MM-DD") === yesterday,
	);

	if (filtered.length > 0) {
		return { items: filtered.slice(0, maxItems), isFallback: false };
	}
	return { items: items.slice(0, maxItems), isFallback: true };
}

/**
 * Google News Japan トップニュース（一般）
 * Googleのアルゴリズムでトレンドになっている記事が上位に来る
 */
export function fetchGeneralNews(maxItems = 5): Promise<NewsResult> {
	return fetchGoogleNewsRss(
		`${GOOGLE_NEWS_BASE}?hl=ja&gl=JP&ceid=JP:ja`,
		maxItems,
	);
}

/**
 * IT・技術・AI 分野のニュース
 */
export function fetchItNews(maxItems = 5): Promise<NewsResult> {
	const q = encodeURIComponent("IT 技術 テクノロジー AI ソフトウェア");
	return fetchGoogleNewsRss(
		`${GOOGLE_NEWS_BASE}/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`,
		maxItems,
	);
}

/**
 * インフラ・クラウド・DevOps 分野のニュース
 */
export function fetchInfraNews(maxItems = 5): Promise<NewsResult> {
	const q = encodeURIComponent(
		"インフラ クラウド AWS Azure GCP Kubernetes DevOps SRE",
	);
	return fetchGoogleNewsRss(
		`${GOOGLE_NEWS_BASE}/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`,
		maxItems,
	);
}

/**
 * RSS XML をパースして NewsItem 配列に変換
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
