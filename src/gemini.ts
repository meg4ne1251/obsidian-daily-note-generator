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

const GEMINI_MODEL = "gemini-2.5-flash-lite";
// LLM の生成は RSS 取得より時間がかかるため長めに設定。
const FETCH_TIMEOUT_MS = 30_000;

export type NewsCategory = "general" | "it" | "infra";

const CATEGORY_INSTRUCTION: Record<NewsCategory, string> = {
	general:
		"以下は日本国内で今まさに話題のニュース見出し一覧です。特に注目度・拡散度・影響度が高い国内トピックを5つ選び、",
	it: "以下のIT・技術・AI分野のニュース見出し一覧から、特に注目・影響度が高いトピックを5つ選び、",
	infra: "以下のインフラ・クラウド・DevOps・SRE分野のニュース見出し一覧から、特に注目・影響度が高いトピックを5つ選び、",
};

export async function summarizeWithGemini(
	apiKey: string,
	newsTitles: string[],
	category: NewsCategory = "general",
): Promise<string> {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return "*Gemini API Key が設定されていません。.env で GEMINI_API_KEY を設定してください。*";
	}

	if (newsTitles.length === 0) {
		return "*要約するニュースがありません*";
	}

	const prompt = [
		"あなたはニュースキュレーターです。",
		CATEGORY_INSTRUCTION[category],
		"特に本日または昨日に話題になった・拡散された新しいトピックを優先してください。",
		"各見出しの括弧内には、ソース・ブックマーク数・公開からの経過時間などの参考情報が含まれることがあります。",
		"それぞれ1〜2文で簡潔に日本語で要約してください。",
		"出力はMarkdownの箇条書き（- ）で返してください。",
		"",
		"ニュース見出し:",
		...newsTitles.map((t, i) => `${i + 1}. ${t}`),
	].join("\n");

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": trimmedKey,
		},
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
		}),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	if (!res.ok) {
		let apiMessage = "";
		let apiStatus = "";
		try {
			const err = (await res.json()) as GeminiErrorResponse;
			if (err?.error?.message) apiMessage = `: ${err.error.message}`;
			if (err?.error?.status) apiStatus = ` [${err.error.status}]`;
		} catch {
			// ignore
		}

		if (res.status === 400) {
			throw new Error(
				`Gemini API エラー (HTTP 400)${apiStatus}${apiMessage} — ` +
					`API キーの形式が不正、またはリクエスト本文に問題があります。`,
			);
		}
		if (res.status === 401 || res.status === 403) {
			throw new Error(
				`Gemini API エラー (HTTP ${res.status})${apiStatus}${apiMessage} — ` +
					`API キーが無効か権限がありません。Google AI Studio で生成し直し、` +
					`「Generative Language API」が有効になっていることを確認してください。`,
			);
		}
		if (res.status === 404) {
			throw new Error(
				`Gemini API エラー (HTTP 404)${apiStatus}${apiMessage} — ` +
					`モデル「${GEMINI_MODEL}」が見つかりません。Google 側でモデル名が変わった可能性があります。` +
					`https://ai.google.dev/gemini-api/docs/models で利用可能なモデル名を確認してください。`,
			);
		}
		if (res.status === 429) {
			throw new Error(
				`Gemini API エラー (HTTP 429)${apiStatus}${apiMessage} — ` +
					`レートリミット超過です。少し時間を置いて再試行してください。`,
			);
		}
		throw new Error(`Gemini API エラー (HTTP ${res.status})${apiStatus}${apiMessage}`);
	}

	const data = (await res.json()) as GeminiResponse;

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
