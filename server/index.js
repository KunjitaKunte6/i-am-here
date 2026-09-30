import "dotenv/config";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const PORT = process.env.PORT || 5000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_HISTORY = 20;        // messages sent to Gemini per request
const MAX_CHARS = 4000;        // per message

if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
  console.error("Missing GEMINI_API_KEY or FIREBASE_PROJECT_ID in .env");
  process.exit(1);
}

// Only the project ID is needed to verify ID tokens.
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

const SYSTEM_PROMPT = `You are the companion inside "I Am Here", an app people open when they want someone to talk to.
- Be warm, calm and genuinely attentive. Listen first; reflect back what you heard before offering ideas.
- Keep replies short and conversational (2-5 sentences) unless the person asks for more.
- Ask at most one gentle question at a time.
- You are an AI, not a therapist or a replacement for the people in their life. Gently encourage real-world connection when it fits.
- If someone mentions wanting to hurt themselves or others, respond with care, encourage them to reach out to someone they trust right now, and share that in India they can call Tele-MANAS at 14416 (free, 24/7).`;

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

// Middleware: reject requests without a valid Firebase ID token.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in to continue." });

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.error("Token check failed:", err.message);
    res.status(401).json({ error: "Your session expired. Sign in again." });
  }
}

// Validate and trim the history the client sent.
function cleanHistory(messages) {
  if (!Array.isArray(messages)) return null;

  const cleaned = [];
  for (const m of messages.slice(-MAX_HISTORY)) {
    if (m?.role !== "user" && m?.role !== "assistant") continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    const content = m.content.slice(0, MAX_CHARS);

    // The model expects alternating roles: merge back-to-back messages from the same side.
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + content;
    else cleaned.push({ role: m.role, content });
  }

  // The conversation must start and end with the user.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") return null;
  return cleaned;
}

// Retry on temporary errors (server busy), waiting a little longer each time.
async function callGemini(payload, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );
    if (response.status !== 503 || i === attempts) return response;
    console.log(`Gemini busy, retrying (${i}/${attempts - 1})...`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * i));
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/chat", requireAuth, async (req, res) => {
  const messages = cleanHistory(req.body?.messages);
  if (!messages) return res.status(400).json({ error: "Send at least one message." });

  try {
    // Gemini calls the assistant role "model" and wraps text in "parts".
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await callGemini({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Too many messages right now. Wait a minute and try again." });
    }
    if (response.status === 503) {
      return res.status(503).json({ error: "The companion is busy right now. Try again in a minute." });
    }
    if (!response.ok) {
      console.error("Gemini API error", response.status, await response.text());
      return res.status(502).json({ error: "The companion couldn't reply just now. Try again." });
    }

    const data = await response.json();
    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({ error: "The companion couldn't reply just now. Try again." });
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server. Try again." });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));