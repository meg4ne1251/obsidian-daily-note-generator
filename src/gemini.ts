import { requestUrl } from "obsidian";

interface GeminiResponse {
	candidates?: {
		content: {
			parts: { text: string }[];
		};
		finishReason?: string;
	}[];
	promptFeedback?: {
		blockReason?: string;
	};
}

interface GeminiErrorResponse {
	error?: {
		code?: number;
		message?: string;
		status?: string;
	};
}

// 安定版モデル。preview 名 (gemini-2.5-flash-lite-preview-06-17 等) は
// 安定版リリース後に廃止されて 404 になるため、安定版を使用する。
const GEMINI_MODEL = "gemini-2.5-flash-lite";

export type NewsCategory = "general" | "it" | "infra";

const CATEGORY_INSTRUCTION: Record<NewsCategory, string> = {
	general:
		"以下のニュース見出し一覧から、特に注目・影響度が高いトピックを5つ選び、",
	it: "以下のIT・技術・AI分野のニュース見出し一覧から、特に注目・影響度が高いトピックを5つ選び、",
	infra: "以下のインフラ・クラウド・DevOps・SRE分野のニュース見出し一覧から、特に注目・影響度が高いトピックを5つ選び、",
};

/**
 * Gemini 2.5 Flash-Lite API でニュース見出しを日本語要約する
 */
export async function summarizeWithGemini(
	apiKey: string,
	newsTitles: string[],
	category: NewsCategory = "general",
): Promise<string> {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return "*Gemini API Key が設定されていません。設定画面で入力してください。*";
	}

	if (newsTitles.length === 0) {
		return "*要約するニュースがありません*";
	}

	const prompt = [
		"あなたはニュースキュレーターです。",
		CATEGORY_INSTRUCTION[category],
		"それぞれ1〜2文で簡潔に日本語で要約してください。",
		"出力はMarkdownの箇条書き（- ）で返してください。",
		"",
		"ニュース見出し:",
		...newsTitles.map((t, i) => `${i + 1}. ${t}`),
	].join("\n");

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

	const res = await requestUrl({
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": trimmedKey,
		},
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
		}),
		throw: false,
	});

	if (res.status !== 200) {
		// Gemini のエラーボディから具体メッセージを取り出す
		let apiMessage = "";
		let apiStatus = "";
		try {
			const err = res.json as GeminiErrorResponse;
			if (err?.error?.message) apiMessage = `: ${err.error.message}`;
			if (err?.error?.status) apiStatus = ` [${err.error.status}]`;
		} catch {
			// ignore
		}

		if (res.status === 400) {
			throw new Error(
				`Gemini API エラー (HTTP 400)${apiStatus}${apiMessage} — ` +
					`API キーの形式が不正、またはリクエスト本文に問題があります。`
			);
		}
		if (res.status === 401 || res.status === 403) {
			throw new Error(
				`Gemini API エラー (HTTP ${res.status})${apiStatus}${apiMessage} — ` +
					`API キーが無効か権限がありません。Google AI Studio で生成し直し、` +
					`「Generative Language API」が有効になっていることを確認してください。`
			);
		}
		if (res.status === 404) {
			throw new Error(
				`Gemini API エラー (HTTP 404)${apiStatus}${apiMessage} — ` +
					`モデル「${GEMINI_MODEL}」が見つかりません。Google 側でモデル名が変わった可能性があります。` +
					`https://ai.google.dev/gemini-api/docs/models で利用可能なモデル名を確認してください。`
			);
		}
		if (res.status === 429) {
			throw new Error(
				`Gemini API エラー (HTTP 429)${apiStatus}${apiMessage} — ` +
					`レートリミット超過です。少し時間を置いて再試行してください。`
			);
		}
		throw new Error(`Gemini API エラー (HTTP ${res.status})${apiStatus}${apiMessage}`);
	}

	const data: GeminiResponse = res.json;

	// 安全性フィルタなどでブロックされた場合
	if (data.promptFeedback?.blockReason) {
		return `*Gemini にプロンプトがブロックされました (${data.promptFeedback.blockReason})*`;
	}

	const candidate = data.candidates?.[0];
	const text = candidate?.content?.parts?.[0]?.text;

	if (!text) {
		const reason = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : "";
		return `*Gemini からの応答を取得できませんでした${reason}*`;
	}

	return text.trim();
}
