import { requestUrl } from "obsidian";

interface GeminiResponse {
	candidates?: {
		content: {
			parts: { text: string }[];
		};
	}[];
}

/**
 * Gemini 2.5 Flash-Lite API でニュース見出しを日本語要約する
 */
export async function summarizeWithGemini(
	apiKey: string,
	newsTitles: string[],
): Promise<string> {
	if (!apiKey) {
		return "*Gemini API Key が設定されていません。設定画面で入力してください。*";
	}

	if (newsTitles.length === 0) {
		return "*要約するニュースがありません*";
	}

	const prompt = [
		"あなたはニュースキュレーターです。",
		"以下のニュース見出し一覧から、特に重要なトピックを3つ選び、",
		"それぞれ1〜2文で簡潔に日本語で要約してください。",
		"出力はMarkdownの箇条書き（- ）で返してください。",
		"",
		"ニュース見出し:",
		...newsTitles.map((t, i) => `${i + 1}. ${t}`),
	].join("\n");

	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;

	const res = await requestUrl({
		url,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
		}),
	});

	const data: GeminiResponse = res.json;
	const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!text) {
		return "*Gemini からの応答を取得できませんでした*";
	}

	return text.trim();
}
