import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { PDFParse } from "pdf-parse";

// --- NER Label → Node Type mapping ---
const NER_TYPE_MAP: Record<string, string> = {
  PER: "Person",
  ORG: "Organization",
  LOC: "Location",
  MISC: "Concept",
};

// --- Hugging Face: Entity Extraction via NER ---
async function extractEntitiesHF(text: string) {
  const token = process.env.HUGGINGFACE_TOKEN;
  if (!token) throw new Error("HUGGINGFACE_TOKEN environment variable is not set.");

  const res = await fetch(
    "https://router.huggingface.co/hf-inference/models/dslim/bert-base-NER",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Hugging Face API error (${res.status}): ${errBody}`);
  }

  const raw: Array<{
    entity_group: string;
    word: string;
    score: number;
    start: number;
    end: number;
  }> = await res.json();

  // Merge adjacent sub-word tokens (BERT splits "Elon Musk" into "El", "##on", "Musk")
  // Use character offsets to reconstruct full entity names from the original text
  const merged: Array<{ name: string; type: string }> = [];
  let i = 0;
  while (i < raw.length) {
    const start = raw[i].start;
    let end = raw[i].end;
    let bestType = raw[i].entity_group;
    let bestScore = raw[i].score;

    // Merge consecutive tokens that are adjacent or overlapping
    while (i + 1 < raw.length && raw[i + 1].start <= end + 1) {
      i++;
      end = Math.max(end, raw[i].end);
      // Use the highest-confidence token's entity type
      if (raw[i].score > bestScore) {
        bestScore = raw[i].score;
        bestType = raw[i].entity_group;
      }
    }

    const name = text.substring(start, end).trim();
    if (name.length >= 2) {
      merged.push({ name, type: bestType });
    }
    i++;
  }

  // Deduplicate by normalized name
  const seen = new Map<string, { id: string; type: string }>();
  for (const ent of merged) {
    const key = ent.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        id: ent.name,
        type: NER_TYPE_MAP[ent.type] || "Concept",
      });
    }
  }

  return Array.from(seen.values());
}

// --- OpenRouter: Chat completion (free tier with fallback models) ---
const FREE_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

async function callOpenRouter(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY environment variable is not set.");

  for (const model of FREE_MODELS) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    });

    if (res.status === 429 || res.status === 503 || res.status === 502) {
      console.warn(`Rate limited on ${model} (${res.status}), trying next...`);
      continue;
    }

    if (!res.ok) {
      const errBody = await res.text();
      // Some rate limit errors come as other status codes with "rate" in body
      if (errBody.toLowerCase().includes("rate-limit") || errBody.toLowerCase().includes("rate_limit")) {
        console.warn(`Rate limited on ${model} (body), trying next...`);
        continue;
      }
      throw new Error(`OpenRouter API error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    // OpenRouter can return 200 with an error object inside
    if (data.error) {
      console.warn(`Error from ${model}: ${data.error.message || JSON.stringify(data.error)}, trying next...`);
      continue;
    }

    const content = data.choices?.[0]?.message?.content || "";
    if (content) {
      console.log(`Used model: ${model}`);
      return content;
    }
  }

  throw new Error("All free models are rate-limited. Please try again in a few minutes.");
}

// --- OpenRouter: Relationship Extraction ---
async function extractRelationshipsOpenRouter(
  text: string,
  entities: Array<{ id: string; type: string }>
) {
  const entityList = entities.map((e) => e.id).join(", ");

  const prompt = `You are an AI that extracts relationships between entities from text.

Given the following text and list of entities, identify the relationships between them.

Entities: ${entityList}

Text:
${text.substring(0, 2000)}

Return ONLY a valid JSON array of relationships. Each relationship has "source", "target", and "label" fields.
Use simple relationship verbs (e.g., "uses", "builds", "creates", "depends on", "is part of").
Only use entities from the provided list. Do NOT invent new entities.
Do NOT include any explanation or markdown — just the JSON array.

Example output:
[{"source": "Entity1", "target": "Entity2", "label": "uses"}]`;

  const content = await callOpenRouter([
    { role: "user", content: prompt },
  ]);

  // Parse JSON from response
  try {
    const cleaned = content
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const links = Array.isArray(parsed) ? parsed : parsed.links || parsed.relationships || [];

    // Validate that source/target exist in entity list
    const entityIds = new Set(entities.map((e) => e.id.toLowerCase()));
    return links.filter(
      (l: any) =>
        l.source &&
        l.target &&
        l.label &&
        entityIds.has(String(l.source).toLowerCase()) &&
        entityIds.has(String(l.target).toLowerCase())
    );
  } catch {
    console.warn("Failed to parse relationships JSON from OpenRouter. Raw:", content);
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // API route for saving API keys from frontend
  app.post("/api/settings", (req, res) => {
    const { hfToken, orKey } = req.body;
    if (hfToken) process.env.HUGGINGFACE_TOKEN = hfToken;
    if (orKey) process.env.OPENROUTER_API_KEY = orKey;
    res.json({ ok: true });
  });

  // API route for extracting the graph
  app.post("/api/extract", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      // Step 1: Extract entities via Hugging Face NER
      const entities = await extractEntitiesHF(text);

      if (entities.length === 0) {
        return res.json({ nodes: [], links: [] });
      }

      // Step 2: Extract relationships via OpenRouter
      const links = await extractRelationshipsOpenRouter(text, entities);

      return res.json({
        nodes: entities,
        links,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "An error occurred during extraction" });
    }
  });

  // API route for node descriptions
  app.post("/api/explain", async (req, res) => {
    try {
      const { nodeId, nodeType, context } = req.body;
      if (!nodeId) return res.status(400).json({ error: "Node ID is required" });

      const prompt = `Define or explain the concept of "${nodeId}" (${nodeType}) in 2-3 short, concise sentences. Context: it is related to the following text: "${(context || "").substring(0, 500)}". Focus on its basic meaning and significance.`;

      const text = await callOpenRouter([
        { role: "user", content: prompt },
      ]);

      return res.json({ text });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "An error occurred during explanation" });
    }
  });

  // API route for URL scraping
  app.post("/api/scrape", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KnowledgeGraphBot/1.0)" },
      });
      if (!response.ok) throw new Error(`Failed to fetch URL (${response.status})`);

      const html = await response.text();
      // Strip HTML tags and extract text content
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 5000);

      return res.json({ text });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to scrape URL" });
    }
  });

  // API route for PDF upload
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      let text = "";

      if (ext === ".pdf") {
        const parser = new PDFParse(new Uint8Array(req.file.buffer));
        const result = await parser.getText();
        text = String(result).substring(0, 5000);
      } else if (ext === ".txt" || ext === ".md") {
        text = req.file.buffer.toString("utf-8").substring(0, 5000);
      } else {
        return res.status(400).json({ error: "Unsupported file type. Use .pdf, .txt, or .md" });
      }

      return res.json({ text });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to process file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
