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
const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss";

// 「今日・昨日に検索で話題になった」トピックを取得する源。
// geo を増やせば対象国を追加できる（例: { geo: "US", source: "Google Trends(世界)" }）。
const GOOGLE_TRENDS_FEEDS: { geo: string; source: string }[] = [
	{ geo: "JP", source: "Google Trends" },
];

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

export function parseRss2(xml: string): NewsItem[] {
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

export function parseHatena(xml: string): NewsItem[] {
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

export function parseAtom(xml: string): NewsItem[] {
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

// Google トレンドの Daily Trends RSS をパースする。各 <item> は検索急上昇ワード
// （<title>）で、関連ニュースが <ht:news_item_*> としてぶら下がる。見出しらしさを
// 優先し、関連ニュースのタイトル/URL があればそれを採用、無ければ検索語そのものを使う。
export function parseGoogleTrends(xml: string): NewsItem[] {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	const items = doc.getElementsByTagName("item");
	const result: NewsItem[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const term = getFirstElementText(item, "title").trim();
		const pubDate = getFirstElementText(item, "pubDate");
		const newsTitle = getFirstElementText(item, "ht:news_item_title").trim();
		const newsUrl = getFirstElementText(item, "ht:news_item_url").trim();
		const title = newsTitle || term;
		const link =
			newsUrl ||
			(term ? `https://www.google.com/search?q=${encodeURIComponent(term)}` : "");
		if (title && link) result.push({ title, link, pubDate });
	}
	return result;
}

export function withSource(items: NewsItem[], source: string): NewsItem[] {
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

async function fetchGoogleTrends(geo: string, source: string): Promise<NewsItem[]> {
	const xml = await fetchText(`${GOOGLE_TRENDS_RSS}?geo=${geo}`);
	return withSource(parseGoogleTrends(xml), source);
}

export function dedupeByLink(items: NewsItem[]): NewsItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (!item.link || seen.has(item.link)) return false;
		seen.add(item.link);
		return true;
	});
}

// ---- 鮮度・話題度スコアリング ----

// 「その日・前日に話題になったか」を測るための窓。これより古い記事は落とす。
export const RECENT_WINDOW_HOURS = 48;

// ブックマーク数を [0,1] に正規化する際の頭打ち。これ以上は等しく「強い話題」とみなす。
const BUZZ_CAP = 300;

// ブックマーク数のような明示的な話題度指標を持たないソース向けの代理値。
// そのフィード自体が「人気・トレンド」枠である度合いを表す。
const SOURCE_BUZZ_BASELINE: Record<string, number> = {
	"Google Trends": 0.85,
	"Yahoo!": 0.4,
	はてブ: 0.4,
	Qiita: 0.35,
	Zenn: 0.35,
	Publickey: 0.3,
	"Google News": 0.3,
};
const DEFAULT_BUZZ_BASELINE = 0.3;

export function parsePubDate(value: string): Date | null {
	if (!value) return null;
	// RFC822（RSS の pubDate）も ISO8601（Atom の published / dc:date）も Date 構築子で解釈できる。
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function hoursSince(item: NewsItem, now: Date): number | null {
	const date = parsePubDate(item.pubDate);
	if (!date) return null;
	return (now.getTime() - date.getTime()) / 3_600_000;
}

// 直近 windowHours 以内の記事だけ残す。日付が取れない記事は、フィードの形式差異で
// セクションを丸ごと空にしないよう除外せず通す（スコア上は中庸に扱う）。
export function filterRecent(
	items: NewsItem[],
	now: Date,
	windowHours = RECENT_WINDOW_HOURS,
): NewsItem[] {
	return items.filter((item) => {
		const hours = hoursSince(item, now);
		if (hours === null) return true;
		return hours <= windowHours;
	});
}

// 新しいほど 1 に近づく鮮度スコア。窓の端で 0、日付不明は中庸の 0.5。
export function recencyScore(
	item: NewsItem,
	now: Date,
	windowHours = RECENT_WINDOW_HOURS,
): number {
	const hours = hoursSince(item, now);
	if (hours === null) return 0.5;
	const clamped = Math.min(Math.max(hours, 0), windowHours);
	return 1 - clamped / windowHours;
}

// 話題度スコア。ブックマーク数があれば正規化、無ければソース種別の代理値を使う。
export function buzzScore(item: NewsItem): number {
	if (typeof item.bookmarkCount === "number") {
		return Math.min(1, item.bookmarkCount / BUZZ_CAP);
	}
	return SOURCE_BUZZ_BASELINE[item.source ?? ""] ?? DEFAULT_BUZZ_BASELINE;
}

// 鮮度と話題度を半々で合成したスコア。大きいほど「今まさに話題」。
export function trendScore(
	item: NewsItem,
	now: Date,
	windowHours = RECENT_WINDOW_HOURS,
): number {
	return 0.5 * recencyScore(item, now, windowHours) + 0.5 * buzzScore(item);
}

// スコア降順で並べ替える。Array.prototype.sort は安定なので同点は入力順を保つ。
export function rankByTrend(
	items: NewsItem[],
	now: Date,
	windowHours = RECENT_WINDOW_HOURS,
): NewsItem[] {
	return [...items].sort(
		(a, b) => trendScore(b, now, windowHours) - trendScore(a, now, windowHours),
	);
}

// 見出しや要約に添える「6時間前 / 2日前」などの相対表記。日付不明なら空文字。
export function formatRelativeTime(pubDate: string, now: Date): string {
	const date = parsePubDate(pubDate);
	if (!date) return "";
	const hours = Math.floor((now.getTime() - date.getTime()) / 3_600_000);
	if (hours < 0) return "まもなく";
	if (hours < 1) return "1時間以内";
	if (hours < 24) return `${hours}時間前`;
	return `${Math.floor(hours / 24)}日前`;
}

export function matchesInfra(item: NewsItem): boolean {
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

// 各ソースから集めた候補を「直近のみ → 重複排除 → 話題度順」で仕上げる共通処理。
// now は単体テストで時刻を固定するために注入する（通常は現在時刻）。
function finalizeNews(
	merged: NewsItem[],
	maxItems: number,
	now: Date,
): NewsItem[] {
	const recent = filterRecent(merged, now);
	return rankByTrend(dedupeByLink(recent), now).slice(0, maxItems);
}

// maxItems は呼び出し側（index.ts）が表示・要約したい件数を指定する。
// デフォルトの 5 は単体利用時のフォールバックで、通常は 20 が渡される。
export async function fetchGeneralNews(
	maxItems = 5,
	now: Date = new Date(),
): Promise<NewsItem[]> {
	const [yahoo, ...trends] = await Promise.all([
		safeFetch("Yahoo top picks", fetchYahooTopPicks),
		...GOOGLE_TRENDS_FEEDS.map((f) =>
			safeFetch(`Google Trends ${f.geo}`, () =>
				fetchGoogleTrends(f.geo, f.source),
			),
		),
	]);
	const merged = [
		...yahoo.slice(0, 12),
		...trends.flatMap((t) => t.slice(0, 10)),
	];
	return finalizeNews(merged, maxItems, now);
}

export async function fetchItNews(
	maxItems = 5,
	now: Date = new Date(),
): Promise<NewsItem[]> {
	const [hatena, qiita, zenn, publickey, google] = await Promise.all([
		safeFetch("Hatena IT", fetchHatenaIt),
		safeFetch("Qiita popular", fetchQiitaPopular),
		safeFetch("Zenn trending", fetchZennTrending),
		safeFetch("Publickey", fetchPublickey),
		safeFetch("Google News IT", () =>
			fetchGoogleNewsSearch("IT 技術 テクノロジー AI ソフトウェア"),
		),
	]);
	const merged = [
		...hatena.slice(0, 8),
		...qiita.slice(0, 6),
		...zenn.slice(0, 6),
		...publickey.slice(0, 5),
		...google.slice(0, 5),
	];
	return finalizeNews(merged, maxItems, now);
}

export async function fetchInfraNews(
	maxItems = 5,
	now: Date = new Date(),
): Promise<NewsItem[]> {
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
	const merged = [
		...hatena.filter(matchesInfra).slice(0, 8),
		...qiita.filter(matchesInfra).slice(0, 6),
		...zenn.filter(matchesInfra).slice(0, 6),
		...publickey.filter(matchesInfra).slice(0, 5),
		...google.slice(0, 6),
	];
	return finalizeNews(merged, maxItems, now);
}
