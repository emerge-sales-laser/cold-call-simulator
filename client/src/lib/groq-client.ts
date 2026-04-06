// Direct browser-to-Groq API calls (no server needed)

const GROQ_API_URL = "https://api.groq.com/openai/v1";

export async function groqChat(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  userMessage: string
): Promise<string> {
  const groqMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const msg of messages) {
    groqMessages.push({
      role: msg.role === "rep" ? "user" : "assistant",
      content: msg.content,
    });
  }
  groqMessages.push({ role: "user", content: userMessage });

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      messages: groqMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function groqScorecard(
  apiKey: string,
  prompt: string
): Promise<string> {
  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

export async function groqWhisper(
  apiKey: string,
  audioBlob: Blob
): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "en");
  formData.append("response_format", "json");

  const res = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.text?.trim() || "";
}
