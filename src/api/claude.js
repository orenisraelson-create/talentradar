export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Access-Control-Allow-Origin", "*");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing API key" });
  try {
    const body = req.body;
    const groqBody = {
      model: "llama-3.3-70b-versatile",
      max_tokens: body.max_tokens || 5000,
      messages: body.system
        ? [{ role: "system", content: body.system }, ...(body.messages || [])]
        : (body.messages || []),
    };
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      content: [{ type: "text", text }]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
