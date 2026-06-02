import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeWithGemini } from "./gemini.js";

function geminiSuccess(text: string): Response {
	return new Response(
		JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
		{ status: 200 },
	);
}

function errorResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("summarizeWithGemini", () => {
	it("API キー未設定なら fetch せず案内メッセージを返す", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const result = await summarizeWithGemini("  ", ["見出し"]);
		expect(result).toContain("Gemini API Key が設定されていません");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("見出しが空なら fetch せず案内メッセージを返す", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const result = await summarizeWithGemini("KEY", []);
		expect(result).toBe("*要約するニュースがありません*");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("正常系: 応答テキストを trim して返す", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => geminiSuccess("\n- 要約1\n- 要約2\n  ")));
		const result = await summarizeWithGemini("KEY", ["A", "B"]);
		expect(result).toBe("- 要約1\n- 要約2");
	});

	it("リクエストにモデル名・APIキー・カテゴリ指示・番号付き見出しを含める", async () => {
		vi.stubGlobal("fetch", vi.fn());
		vi.mocked(fetch).mockResolvedValue(geminiSuccess("ok"));

		await summarizeWithGemini(" KEY ", ["最初の見出し", "次の見出し"], "infra");

		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toContain("gemini-2.5-flash-lite:generateContent");
		expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");

		const body = JSON.parse(String(init?.body));
		const prompt = body.contents[0].parts[0].text as string;
		expect(prompt).toContain("インフラ・クラウド・DevOps・SRE");
		expect(prompt).toContain("1. 最初の見出し");
		expect(prompt).toContain("2. 次の見出し");
	});

	it("カテゴリごとに指示文が変わる（general / it）", async () => {
		// Response の body は一度しか読めないため、呼び出しごとに生成する。
		vi.stubGlobal("fetch", vi.fn());
		vi.mocked(fetch).mockImplementation(async () => geminiSuccess("ok"));

		await summarizeWithGemini("KEY", ["x"], "general");
		await summarizeWithGemini("KEY", ["x"], "it");

		const calls = vi.mocked(fetch).mock.calls;
		const g = JSON.parse(String(calls[0][1]?.body)).contents[0].parts[0].text;
		const i = JSON.parse(String(calls[1][1]?.body)).contents[0].parts[0].text;
		expect(g).toContain("日本国内で今まさに話題");
		expect(i).toContain("IT・技術・AI分野");
	});

	it("promptFeedback.blockReason があればブロック理由を返す", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), {
						status: 200,
					}),
			),
		);
		const result = await summarizeWithGemini("KEY", ["x"]);
		expect(result).toContain("ブロックされました (SAFETY)");
	});

	it("候補テキストが無ければ finishReason 付きメッセージを返す", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }),
						{ status: 200 },
					),
			),
		);
		const result = await summarizeWithGemini("KEY", ["x"]);
		expect(result).toContain("応答を取得できませんでした");
		expect(result).toContain("MAX_TOKENS");
	});

	it.each([
		[400, /HTTP 400/],
		[401, /HTTP 401/],
		[403, /HTTP 403/],
		[404, /モデル「gemini-2.5-flash-lite」が見つかりません/],
		[429, /レートリミット超過/],
		[500, /HTTP 500/],
	])("ステータス %i では専用エラーを投げる", async (status, pattern) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => errorResponse(status, { error: { message: "x", status: "ERR" } })),
		);
		await expect(summarizeWithGemini("KEY", ["x"])).rejects.toThrow(pattern);
	});

	it("エラー応答が JSON でなくてもクラッシュせずエラーを投げる", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("gateway timeout", { status: 504 })),
		);
		await expect(summarizeWithGemini("KEY", ["x"])).rejects.toThrow(/HTTP 504/);
	});
});
