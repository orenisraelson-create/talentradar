export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing API key" });

  try {
    const body = req.body;

    const anthropicBody = {
      model: "claude-sonnet-4-20250514",
      max_tokens: body.max_tokens || 6000,
      messages: body.messages || [],
      ...(body.system && { system: body.system }),
      ...(body.tools && { tools: body.tools }),
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
