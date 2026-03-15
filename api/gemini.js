export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

  try {
    const { system, messages, max_tokens } = req.body;
    const userMessage = messages?.[0]?.content || "";
    const fullPrompt = system ? system + "\n\n" + userMessage : userMessage;

    const body = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: max_tokens || 3000, temperature: 0.3 },
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(500).json({ error: data.error?.message || "Gemini error" });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const searchCount = (data.candidates?.[0]?.groundingMetadata?.webSearchQueries || []).length;

    return res.status(200).json({
      content: [{ type: "text", text }],
      search_count: searchCount,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

