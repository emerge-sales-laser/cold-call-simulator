import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { PERSONAS, PRODUCTS, SCORING_RUBRIC, DEFAULT_PRODUCT_ID } from "./personas";
import Groq from "groq-sdk";
import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildPersonaSystemPrompt(personaId: string, productId: string): string {
  const persona = PERSONAS[personaId];
  const product = PRODUCTS[productId];
  if (!persona || !product) throw new Error("Unknown persona or product");

  return `${persona.systemPrompt}

CRITICAL RULE — YOU DO NOT KNOW WHO IS CALLING:
You just picked up an unknown incoming call. You have NO idea who this person is, what company they're from, or what they're selling. You must act accordingly:
- Answer the phone naturally as yourself, not knowing who is on the other end.
- Be curious, guarded, or slightly impatient — as you would with any unexpected call.
- Do NOT assume they are a sales rep. Do NOT assume they are calling about any specific product or service.
- Ask who they are and why they're calling if they don't immediately explain.
- Only once they identify themselves and their purpose should you begin to engage with their pitch.
- If they give a vague or generic opener, challenge them: "Who is this?" or "What's this regarding?"
- React based ONLY on what they actually say, not on any background knowledge about what they might be selling.

BEHIND-THE-SCENES CONTEXT (use this ONLY to inform your reactions AFTER the caller reveals their purpose — never reference this proactively):
The caller may be selling: ${product.name} (${product.category})
If they mention it, you'd know competitors in this space include: ${product.commonCompetitors.join(", ")}
Typical pricing for this kind of service: ${product.typicalPrice}

IMPORTANT BEHAVIORAL NOTES:
- Do NOT say you have "a meeting in 10 minutes" or any specific time constraint unless the conversation warrants it naturally. Vary your availability — sometimes you're at your desk, sometimes walking between offices, sometimes in the middle of something. Be unpredictable.
- Do NOT rush to give the caller time or be overly accommodating. Make them earn your attention.
- Stay in character as ${persona.displayName}.
- Keep responses to 2-4 sentences — this is a phone call.
- React authentically to what the caller says. Don't reveal all your objections at once.
- If they earn a next step, offer one. If they don't, push back or disengage.`;
}

function buildScoringPrompt(
  personaId: string,
  productId: string,
  transcript: Array<{ role: string; content: string }>
): string {
  const persona = PERSONAS[personaId];
  const product = PRODUCTS[productId];

  const transcriptText = transcript
    .map((m) => `${m.role === "rep" ? "REP" : persona.displayName.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return `You are an elite sales trainer and coach specializing in inside sales and outsourced pipeline generation for medical device companies.

SIMULATION CONTEXT:
- The rep works for Emerge, an outsourced inside sales firm that serves medical device manufacturers.
- The rep was cold-calling: ${persona.title} — ${persona.displayName}
- Service being sold: ${product.name} (${product.category})
- Persona decision role: ${persona.decisionRole}
- Persona top concerns: ${persona.topConcerns.join(", ")}

CALL TRANSCRIPT:
${transcriptText}

SCORING RUBRIC:
${SCORING_RUBRIC}

Return your evaluation as a JSON object with this exact structure:
{
  "dimensions": [
    { "name": "Opening & Pattern Interrupt", "score": <1-10>, "feedback": "<specific feedback with transcript reference>" },
    { "name": "Rapport & Trust Building", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Discovery & Questioning", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Value Proposition Delivery", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Objection Handling", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Medical Device Knowledge", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Call Control & Momentum", "score": <1-10>, "feedback": "<specific feedback>" },
    { "name": "Close / Next Step", "score": <1-10>, "feedback": "<specific feedback>" }
  ],
  "overallScore": <0-100>,
  "strengths": ["<strength 1 with example>", "<strength 2 with example>"],
  "improvements": ["<improvement 1 with coaching>", "<improvement 2 with coaching>", "<improvement 3 with coaching>"],
  "verdict": "<Strong Call | Developing | Needs Work>",
  "coachingSummary": "<2-3 sentence overall coaching note>"
}

Return ONLY valid JSON, no other text.`;
}

// ── Routes ───────────────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express) {
  const serializePersona = (p: (typeof PERSONAS)[string]) => ({
    id: p.id,
    title: p.title,
    displayName: p.displayName,
    company: p.company,
    companyDescription: p.companyDescription,
    department: p.department,
    avatar: p.avatar,
    decisionRole: p.decisionRole,
    topConcerns: p.topConcerns,
  });

  app.get("/api/personas", (_req, res) => {
    res.json(Object.values(PERSONAS).map(serializePersona));
  });

  app.get("/api/products", (_req, res) => {
    res.json(Object.values(PRODUCTS).map((p) => ({
      id: p.id, name: p.name, category: p.category, description: p.description,
      keyBenefits: p.keyBenefits, typicalPrice: p.typicalPrice, targetBuyers: p.targetBuyers,
    })));
  });

  // Transcribe audio via Groq Whisper
  app.post("/api/transcribe", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      if (!apiKey) return res.status(400).json({ error: "Missing API key" });

      const audioBuffer = req.body;
      if (!audioBuffer || !(audioBuffer instanceof Buffer) || audioBuffer.length === 0) {
        return res.status(400).json({ error: "No audio data received", bodyType: typeof audioBuffer, isBuffer: Buffer.isBuffer(audioBuffer), size: audioBuffer?.length || 0 });
      }
      console.log("[Transcribe] Received audio buffer:", audioBuffer.length, "bytes");

      // Send to Groq Whisper API
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: "audio/webm" });
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("language", "en");
      formData.append("response_format", "json");

      const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        return res.status(whisperRes.status).json({ error: `Whisper error: ${errText}` });
      }

      const result = await whisperRes.json();
      res.json({ text: result.text || "" });
    } catch (err: any) {
      console.error("Transcribe error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { personaId, repName } = z.object({ personaId: z.string(), repName: z.string().min(1) }).parse(req.body);
      const productId = DEFAULT_PRODUCT_ID;
      if (!PERSONAS[personaId]) return res.status(400).json({ error: "Unknown persona" });

      const session = storage.createSession({
        personaId, productId, repName, status: "active",
        startedAt: new Date().toISOString(), endedAt: null, transcript: "[]", scorecardJson: null,
      });

      res.json({ session, persona: serializePersona(PERSONAS[personaId]), product: PRODUCTS[productId] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/sessions/:id", (req, res) => {
    const session = storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ session, persona: serializePersona(PERSONAS[session.personaId]), product: PRODUCTS[session.productId] });
  });

  app.get("/api/sessions", (_req, res) => {
    res.json(storage.getAllSessions().map((s) => ({
      ...s, persona: serializePersona(PERSONAS[s.personaId]), product: PRODUCTS[s.productId],
    })));
  });

  // Send a message — Groq (Llama 3.3 70B)
  app.post("/api/sessions/:id/message", async (req, res) => {
    try {
      const session = storage.getSession(Number(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.status !== "active") return res.status(400).json({ error: "Session is not active" });

      const { content, apiKey } = z.object({ content: z.string().min(1), apiKey: z.string().min(1) }).parse(req.body);

      const transcript: Array<{ role: string; content: string }> = JSON.parse(session.transcript || "[]");
      transcript.push({ role: "rep", content });
      storage.addMessage({ sessionId: session.id, role: "rep", content, timestamp: new Date().toISOString(), tone: null });

      const systemPrompt = buildPersonaSystemPrompt(session.personaId, session.productId);
      const groq = new Groq({ apiKey });

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];
      for (const msg of transcript) {
        messages.push({ role: msg.role === "rep" ? "user" : "assistant", content: msg.content });
      }

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages,
      });

      const prospectReply = response.choices[0]?.message?.content || "";
      transcript.push({ role: "prospect", content: prospectReply });
      storage.addMessage({ sessionId: session.id, role: "prospect", content: prospectReply, timestamp: new Date().toISOString(), tone: null });
      storage.updateSession(session.id, { transcript: JSON.stringify(transcript) });

      res.json({ reply: prospectReply, transcript });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Save transcript from voice session
  app.post("/api/sessions/:id/transcript", async (req, res) => {
    try {
      const session = storage.getSession(Number(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      const { transcript } = z.object({ transcript: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(req.body);
      storage.updateSession(session.id, { transcript: JSON.stringify(transcript) });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // End call and generate scorecard — Groq
  app.post("/api/sessions/:id/end", async (req, res) => {
    try {
      const session = storage.getSession(Number(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });

      const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);
      const transcript: Array<{ role: string; content: string }> = JSON.parse(session.transcript || "[]");

      if (transcript.length < 2) {
        return res.status(400).json({ error: "Not enough conversation to score — have a full call first." });
      }

      const scoringPrompt = buildScoringPrompt(session.personaId, session.productId, transcript);
      const groq = new Groq({ apiKey });

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 4096,
        messages: [{ role: "user", content: scoringPrompt }],
      });

      const scoringText = response.choices[0]?.message?.content || "{}";

      let scorecard: any = {};
      try {
        let cleanJson = scoringText.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        }
        scorecard = JSON.parse(cleanJson);
      } catch {
        const jsonStart = scoringText.indexOf("{");
        const jsonEnd = scoringText.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try { scorecard = JSON.parse(scoringText.substring(jsonStart, jsonEnd + 1)); }
          catch { scorecard = { error: "Could not parse scorecard", raw: scoringText }; }
        } else {
          scorecard = { error: "Could not parse scorecard", raw: scoringText };
        }
      }

      storage.updateSession(session.id, {
        status: "completed", endedAt: new Date().toISOString(), scorecardJson: JSON.stringify(scorecard),
      });

      res.json({ scorecard, transcript });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sessions/:id/scorecard", (req, res) => {
    const session = storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.scorecardJson) return res.status(400).json({ error: "No scorecard available yet" });

    let scorecard: any = {};
    try {
      const parsed = JSON.parse(session.scorecardJson);
      if (parsed.error && parsed.raw) {
        let cleanJson = parsed.raw.trim();
        if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        try { scorecard = JSON.parse(cleanJson); }
        catch {
          const s = cleanJson.indexOf("{"), e = cleanJson.lastIndexOf("}");
          if (s >= 0 && e > s) scorecard = JSON.parse(cleanJson.substring(s, e + 1));
          else scorecard = parsed;
        }
      } else {
        scorecard = parsed;
      }
    } catch { scorecard = {}; }

    res.json({
      scorecard, transcript: JSON.parse(session.transcript || "[]"),
      persona: PERSONAS[session.personaId], product: PRODUCTS[session.productId], session,
    });
  });
}
