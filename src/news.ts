import { DOMParser, type Element } from "@xmldom/xmldom";

export interface NewsItem {
	title: string;
	link: string;
	pubDate: string;
	source?: string;
	bookmarkCount?: number;
	subjects?: string[];
}

const YAHOO_TOP_PICKS = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";
const HATENA_HOTENTRY_IT = "https://b.hatena.ne.jp/hotentry/it.rss";
const QIITA_POPULAR = "https://qiita.com/popular-items/feed";
const ZENN_TRENDING = "https://zenn.dev/feed";
const PUBLICKEY = "https://www.publickey1.jp/atom.xml";
const GOOGLE_NEWS_SEARCH = "https://news.google.com/rss/search";

const INFRA_KEYWORDS = [
	"aws",
	"azure",
	"gcp",
	"google cloud",
	"kubernetes",
	"k8s",
	"docker",
	"terraform",
	"ansible",
	"devops",
	"sre",
	"cloudflare",
	"observability",
	"オブザーバビリティ",
	"クラウド",
	"インフラ",
	"ネットワーク",
	"サーバー",
	"サーバ",
	"コンテナ",
	"linux",
	"cdn",
	"openstack",
	"オーケストレーション",
	"helm",
	"istio",
	"envoy",
	"nginx",
	"redis",
	"kafka",
	"postgresql",
	"mysql",
	"datadog",
	"grafana",
	"prometheus",
];

const FETCH_TIMEOUT_MS = 10_000;

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) {
		throw new Error(`RSS取得エラー (HTTP ${res.status}): ${url}`);
	}
	return res.text();
}

function getFirstElementText(parent: Element, tagName: string): string {
	const elements = parent.getElementsByTagName(tagName);
	if (elements.length === 0) return "";
	return elements[0].textContent ?? "";
}

function getAllElementsText(parent: Element, tagName: string): string[] {
	const elements = parent.getElementsByTagName(tagName);
	const result: string[] = [];
	for (let i = 0; i < elements.length; i++) {
		const text = elements[i].textContent;
		if (text) result.push(text);
	}
	return result;
}

function parseRss2(xml: string): NewsItem[] {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	const items = doc.getElementsByTagName("item");
	const result: NewsItem[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const title = getFirstElementText(item, "title");
		const link = getFirstElementText(item, "link");
		const pubDate = getFirstElementText(item, "pubDate");
		if (title) result.push({ title, link, pubDate });
	}
	return result;
}

function parseHatena(xml: string): NewsItem[] {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	const items = doc.getElementsByTagName("item");
	const result: NewsItem[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const title = getFirstElementText(item, "title");
		const link = getFirstElementText(item, "link");
		const pubDate = getFirstElementText(item, "dc:date");
		const countStr = getFirstElementText(item, "hatena:bookmarkcount");
		const bookmarkCount = countStr ? Number.parseInt(countStr, 10) : undefined;
		const subjects = getAllElementsText(item, "dc:subject");
		if (title) {
			result.push({ title, link, pubDate, bookmarkCount, subjects });
		}
	}
	return result;
}

function parseAtom(xml: string): NewsItem[] {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	const entries = doc.getElementsByTagName("entry");
	const result: NewsItem[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const title = getFirstElementText(entry, "title");
		const pubDate =
			getFirstElementText(entry, "published") ||
			getFirstElementText(entry, "updated");

		let link = "";
		const links = entry.getElementsByTagName("link");
		for (let j = 0; j < links.length; j++) {
			const rel = links[j].getAttribute("rel");
			const href = links[j].getAttribute("href");
			if (href && (!rel || rel === "alternate")) {
				link = href;
				break;
			}
		}

		const subjects: string[] = [];
		const categories = entry.getElementsByTagName("category");
		for (let j = 0; j < categories.length; j++) {
			const term = categories[j].getAttribute("term");
			if (term) subjects.push(term);
		}

		if (title) result.push({ title, link, pubDate, subjects });
	}
	return result;
}

function withSource(items: NewsItem[], source: string): NewsItem[] {
	return items.map((item) => ({ ...item, source }));
}

async function fetchYahooTopPicks(): Promise<NewsItem[]> {
	const xml = await fetchText(YAHOO_TOP_PICKS);
	return withSource(parseRss2(xml), "Yahoo!");
}

async function fetchHatenaIt(): Promise<NewsItem[]> {
	const xml = await fetchText(HATENA_HOTENTRY_IT);
	const items = withSource(parseHatena(xml), "はてブ");
	items.sort((a, b) => (b.bookmarkCount ?? 0) - (a.bookmarkCount ?? 0));
	return items;
}

async function fetchQiitaPopular(): Promise<NewsItem[]> {
	const xml = await fetchText(QIITA_POPULAR);
	return withSource(parseAtom(xml), "Qiita");
}

async function fetchZennTrending(): Promise<NewsItem[]> {
	const xml = await fetchText(ZENN_TRENDING);
	return withSource(parseRss2(xml), "Zenn");
}

async function fetchPublickey(): Promise<NewsItem[]> {
	const xml = await fetchText(PUBLICKEY);
	return withSource(parseAtom(xml), "Publickey");
}

async function fetchGoogleNewsSearch(query: string): Promise<NewsItem[]> {
	const url = `${GOOGLE_NEWS_SEARCH}?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
	const xml = await fetchText(url);
	return withSource(parseRss2(xml), "Google News");
}

function dedupeByLink(items: NewsItem[]): NewsItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (!item.link || seen.has(item.link)) return false;
		seen.add(item.link);
		return true;
	});
}

function roundRobin<T>(sources: T[][]): T[] {
	const result: T[] = [];
	const maxLen = Math.max(0, ...sources.map((s) => s.length));
	for (let i = 0; i < maxLen; i++) {
		for (const source of sources) {
			if (i < source.length) result.push(source[i]);
		}
	}
	return result;
}

function matchesInfra(item: NewsItem): boolean {
	const haystack = [item.title, ...(item.subjects ?? [])]
		.join(" ")
		.toLowerCase();
	return INFRA_KEYWORDS.some((kw) => {
		// ASCII の略語（sre, k8s, cdn など）は単語境界で判定し、
		// "disregard" に "sre" がヒットするような誤検出を防ぐ。
		// 日本語キーワードは単語境界の概念が無いため部分一致のまま。
		if (/^[a-z0-9]+$/.test(kw)) {
			return new RegExp(`\\b${kw}\\b`).test(haystack);
		}
		return haystack.includes(kw);
	});
}

async function safeFetch(
	label: string,
	fn: () => Promise<NewsItem[]>,
): Promise<NewsItem[]> {
	try {
		return await fn();
	} catch (error) {
		console.error(`${label} fetch failed:`, error);
		return [];
	}
}

// maxItems は呼び出し側（index.ts）が表示・要約したい件数を指定する。
// デフォルトの 5 は単体利用時のフォールバックで、通常は 20 が渡される。
export async function fetchGeneralNews(maxItems = 5): Promise<NewsItem[]> {
	const items = await safeFetch("Yahoo top picks", fetchYahooTopPicks);
	return items.slice(0, maxItems);
}

export async function fetchItNews(maxItems = 5): Promise<NewsItem[]> {
	const [hatena, qiita, zenn, publickey, google] = await Promise.all([
		safeFetch("Hatena IT", fetchHatenaIt),
		safeFetch("Qiita popular", fetchQiitaPopular),
		safeFetch("Zenn trending", fetchZennTrending),
		safeFetch("Publickey", fetchPublickey),
		safeFetch("Google News IT", () =>
			fetchGoogleNewsSearch("IT 技術 テクノロジー AI ソフトウェア"),
		),
	]);
	const merged = roundRobin([
		hatena.slice(0, 8),
		qiita.slice(0, 6),
		zenn.slice(0, 6),
		publickey.slice(0, 5),
		google.slice(0, 5),
	]);
	return dedupeByLink(merged).slice(0, maxItems);
}

export async function fetchInfraNews(maxItems = 5): Promise<NewsItem[]> {
	const [hatena, qiita, zenn, publickey, google] = await Promise.all([
		safeFetch("Hatena IT", fetchHatenaIt),
		safeFetch("Qiita popular", fetchQiitaPopular),
		safeFetch("Zenn trending", fetchZennTrending),
		safeFetch("Publickey", fetchPublickey),
		safeFetch("Google News infra", () =>
			fetchGoogleNewsSearch(
				"インフラ クラウド AWS Azure GCP Kubernetes DevOps SRE",
			),
		),
	]);
	const merged = roundRobin([
		hatena.filter(matchesInfra).slice(0, 8),
		qiita.filter(matchesInfra).slice(0, 6),
		zenn.filter(matchesInfra).slice(0, 6),
		publickey.filter(matchesInfra).slice(0, 5),
		google.slice(0, 6),
	]);
	return dedupeByLink(merged).slice(0, maxItems);
}
