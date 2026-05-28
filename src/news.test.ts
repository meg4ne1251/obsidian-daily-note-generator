import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type NewsItem,
	dedupeByLink,
	fetchGeneralNews,
	fetchInfraNews,
	fetchItNews,
	matchesInfra,
	parseAtom,
	parseHatena,
	parseRss2,
	roundRobin,
	withSource,
} from "./news.js";

// ---------- フィクスチャ ----------

function rss2(items: { title: string; link: string; pubDate?: string }[]): string {
	const body = items
		.map(
			(i) =>
				`<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.pubDate ?? ""}</pubDate></item>`,
		)
		.join("");
	return `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`;
}

function atom(
	entries: { title: string; href: string; term?: string }[],
): string {
	const body = entries
		.map(
			(e) =>
				`<entry><title>${e.title}</title>` +
				`<link rel="alternate" href="${e.href}"/>` +
				`<published>2026-05-28T00:00:00Z</published>` +
				(e.term ? `<category term="${e.term}"/>` : "") +
				`</entry>`,
		)
		.join("");
	return `<feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`;
}

function hatena(
	items: {
		title: string;
		link: string;
		count?: number;
		subject?: string;
	}[],
): string {
	const body = items
		.map(
			(i) =>
				`<item rdf:about="${i.link}"><title>${i.title}</title><link>${i.link}</link>` +
				`<dc:date>2026-05-28T00:00:00Z</dc:date>` +
				(i.subject ? `<dc:subject>${i.subject}</dc:subject>` : "") +
				(i.count !== undefined
					? `<hatena:bookmarkcount>${i.count}</hatena:bookmarkcount>`
					: "") +
				`</item>`,
		)
		.join("");
	return (
		`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ` +
		`xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
		`xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">${body}</rdf:RDF>`
	);
}

/** URL の部分一致でレスポンス本文を切り替える fetch モックを差し込む。 */
function stubFetchByUrl(routes: { match: string; xml: string }[]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL) => {
			const url = input.toString();
			const route = routes.find((r) => url.includes(r.match));
			if (!route) throw new Error(`unmocked URL: ${url}`);
			return new Response(route.xml, { status: 200 });
		}),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ---------- 純粋関数 ----------

describe("parseRss2", () => {
	it("title/link/pubDate を抽出する", () => {
		const items = parseRss2(
			rss2([{ title: "記事A", link: "https://e.com/a", pubDate: "Wed, 28 May 2026 00:00:00 GMT" }]),
		);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			title: "記事A",
			link: "https://e.com/a",
			pubDate: "Wed, 28 May 2026 00:00:00 GMT",
		});
	});

	it("title が無い item はスキップする", () => {
		const xml =
			`<?xml version="1.0"?><rss version="2.0"><channel>` +
			`<item><link>https://e.com/x</link></item>` +
			`<item><title>有効</title><link>https://e.com/y</link></item>` +
			`</channel></rss>`;
		const items = parseRss2(xml);
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("有効");
	});
});

describe("parseAtom", () => {
	it("title/published/alternate リンク/category を抽出する", () => {
		const items = parseAtom(atom([{ title: "Qiita記事", href: "https://q.com/1", term: "AWS" }]));
		expect(items[0]).toMatchObject({
			title: "Qiita記事",
			link: "https://q.com/1",
			subjects: ["AWS"],
		});
		expect(items[0].pubDate).toBe("2026-05-28T00:00:00Z");
	});

	it("published が無ければ updated にフォールバックする", () => {
		const xml =
			`<feed xmlns="http://www.w3.org/2005/Atom"><entry>` +
			`<title>T</title><link rel="alternate" href="https://e.com/1"/>` +
			`<updated>2026-01-01T00:00:00Z</updated></entry></feed>`;
		expect(parseAtom(xml)[0].pubDate).toBe("2026-01-01T00:00:00Z");
	});

	it("rel=self ではなく alternate（または rel 無し）のリンクを選ぶ", () => {
		const xml =
			`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title>` +
			`<link rel="self" href="https://e.com/self"/>` +
			`<link rel="alternate" href="https://e.com/alt"/>` +
			`<published>2026-05-28T00:00:00Z</published></entry></feed>`;
		expect(parseAtom(xml)[0].link).toBe("https://e.com/alt");
	});
});

describe("parseHatena", () => {
	it("ブックマーク数・dc:subject・dc:date を抽出する", () => {
		const items = parseHatena(
			hatena([{ title: "HB記事", link: "https://h.com/1", count: 123, subject: "テクノロジー" }]),
		);
		expect(items[0]).toMatchObject({
			title: "HB記事",
			link: "https://h.com/1",
			bookmarkCount: 123,
			subjects: ["テクノロジー"],
			pubDate: "2026-05-28T00:00:00Z",
		});
	});

	it("ブックマーク数が無ければ undefined になる", () => {
		const items = parseHatena(hatena([{ title: "T", link: "https://h.com/2" }]));
		expect(items[0].bookmarkCount).toBeUndefined();
	});
});

describe("dedupeByLink", () => {
	it("同一リンクは最初の1件のみ残す", () => {
		const result = dedupeByLink([
			{ title: "1", link: "a", pubDate: "" },
			{ title: "2", link: "a", pubDate: "" },
			{ title: "3", link: "b", pubDate: "" },
		]);
		expect(result.map((i) => i.title)).toEqual(["1", "3"]);
	});

	it("リンクが空の item は除外される", () => {
		const result = dedupeByLink([
			{ title: "空", link: "", pubDate: "" },
			{ title: "有効", link: "a", pubDate: "" },
		]);
		expect(result.map((i) => i.title)).toEqual(["有効"]);
	});
});

describe("roundRobin", () => {
	it("各ソースから順番に1件ずつ取り出して交互に並べる", () => {
		expect(roundRobin([[1, 2, 3], [4, 5]])).toEqual([1, 4, 2, 5, 3]);
	});

	it("空配列を含んでも動作する", () => {
		expect(roundRobin([[], [1]])).toEqual([1]);
		expect(roundRobin([])).toEqual([]);
	});
});

describe("matchesInfra", () => {
	it("英語の略語は単語境界で判定する（SRE はマッチ）", () => {
		expect(matchesInfra({ title: "SRE practices at scale", link: "", pubDate: "" })).toBe(true);
	});

	it("単語の一部に略語が紛れていても誤検出しない（disregard の sre）", () => {
		expect(matchesInfra({ title: "Please disregard this notice", link: "", pubDate: "" })).toBe(
			false,
		);
	});

	it("日本語キーワードは部分一致で判定する（クラウド）", () => {
		expect(matchesInfra({ title: "クラウド移行の進め方", link: "", pubDate: "" })).toBe(true);
	});

	it("subjects 側のキーワードでもマッチする", () => {
		expect(
			matchesInfra({ title: "完全に無関係な話", link: "", pubDate: "", subjects: ["AWS"] }),
		).toBe(true);
	});

	it("インフラ関連語が無ければマッチしない", () => {
		expect(matchesInfra({ title: "今日の料理レシピ", link: "", pubDate: "" })).toBe(false);
	});
});

describe("withSource", () => {
	it("各 item に source を付与しつつ元のフィールドを保持する", () => {
		const result = withSource([{ title: "T", link: "l", pubDate: "p" }], "Yahoo!");
		expect(result[0]).toEqual({ title: "T", link: "l", pubDate: "p", source: "Yahoo!" });
	});
});

// ---------- 公開 fetch 関数（fetch モック） ----------

describe("fetchGeneralNews", () => {
	it("Yahoo を取得し source を付け maxItems で切り詰める", async () => {
		stubFetchByUrl([
			{
				match: "news.yahoo.co.jp",
				xml: rss2([
					{ title: "Y1", link: "https://y.com/1" },
					{ title: "Y2", link: "https://y.com/2" },
					{ title: "Y3", link: "https://y.com/3" },
				]),
			},
		]);

		const items = await fetchGeneralNews(2);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ title: "Y1", source: "Yahoo!" });
	});

	it("取得失敗時は safeFetch により空配列を返す", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);
		await expect(fetchGeneralNews()).resolves.toEqual([]);
	});
});

describe("fetchItNews", () => {
	function stubAllItSources(): void {
		stubFetchByUrl([
			{
				match: "b.hatena.ne.jp",
				xml: hatena([
					{ title: "H-low", link: "https://h.com/low", count: 50 },
					{ title: "H-high", link: "https://h.com/high", count: 200 },
				]),
			},
			{ match: "qiita.com", xml: atom([{ title: "Q1", href: "https://q.com/1" }]) },
			{ match: "zenn.dev", xml: rss2([{ title: "Z1", link: "https://z.com/1" }]) },
			{ match: "publickey1.jp", xml: atom([{ title: "P1", href: "https://p.com/1" }]) },
			{ match: "news.google.com", xml: rss2([{ title: "G1", link: "https://g.com/1" }]) },
		]);
	}

	it("はてブはブックマーク数の降順、その後ソース横断でラウンドロビンする", async () => {
		stubAllItSources();
		const items = await fetchItNews(20);

		expect(items.map((i) => i.title)).toEqual(["H-high", "Q1", "Z1", "P1", "G1", "H-low"]);
		expect(items[0]).toMatchObject({ source: "はてブ", bookmarkCount: 200 });
		expect(items.find((i) => i.title === "Q1")?.source).toBe("Qiita");
		expect(items.find((i) => i.title === "Z1")?.source).toBe("Zenn");
		expect(items.find((i) => i.title === "P1")?.source).toBe("Publickey");
		expect(items.find((i) => i.title === "G1")?.source).toBe("Google News");
	});

	it("複数ソースに同じリンクがあれば1件に重複排除する", async () => {
		stubFetchByUrl([
			{ match: "b.hatena.ne.jp", xml: hatena([{ title: "H", link: "https://dup.com/1", count: 10 }]) },
			{ match: "qiita.com", xml: atom([{ title: "Q", href: "https://dup.com/1" }]) },
			{ match: "zenn.dev", xml: rss2([]) },
			{ match: "publickey1.jp", xml: atom([]) },
			{ match: "news.google.com", xml: rss2([]) },
		]);

		const items = await fetchItNews(20);
		const dupItems = items.filter((i) => i.link === "https://dup.com/1");
		expect(dupItems).toHaveLength(1);
		// roundRobin 上では はてブ(i=0) が Qiita(i=0) より先に来るため はてブが残る。
		expect(dupItems[0].source).toBe("はてブ");
	});

	it("一部ソースが失敗しても他のソースは取得を継続する", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL) => {
				const url = input.toString();
				if (url.includes("zenn.dev")) throw new Error("zenn down");
				if (url.includes("b.hatena.ne.jp"))
					return new Response(hatena([{ title: "H1", link: "https://h.com/1", count: 5 }]), {
						status: 200,
					});
				return new Response(rss2([]), { status: 200 });
			}),
		);

		const items = await fetchItNews(20);
		expect(items.map((i) => i.title)).toContain("H1");
	});
});

describe("fetchInfraNews", () => {
	it("はてブ/Qiita 等はインフラ語で絞り込み、Google News は絞り込まない", async () => {
		stubFetchByUrl([
			{
				match: "b.hatena.ne.jp",
				xml: hatena([
					{ title: "Kubernetes 入門", link: "https://h.com/k8s", count: 100 },
					{ title: "おすすめ料理レシピ", link: "https://h.com/food", count: 100 },
				]),
			},
			{
				match: "qiita.com",
				xml: atom([
					{ title: "AWS Lambda 活用術", href: "https://q.com/aws" },
					{ title: "週末の映画レビュー", href: "https://q.com/movie" },
				]),
			},
			{ match: "zenn.dev", xml: rss2([]) },
			{ match: "publickey1.jp", xml: atom([]) },
			{
				match: "news.google.com",
				xml: rss2([{ title: "猫の動画まとめ", link: "https://g.com/cat" }]),
			},
		]);

		const items = await fetchInfraNews(20);
		const titles = items.map((i) => i.title);

		expect(titles).toContain("Kubernetes 入門");
		expect(titles).toContain("AWS Lambda 活用術");
		expect(titles).not.toContain("おすすめ料理レシピ");
		expect(titles).not.toContain("週末の映画レビュー");
		// Google News はキーワード非関連でもそのまま含める。
		expect(titles).toContain("猫の動画まとめ");
	});
});
