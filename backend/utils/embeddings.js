import { pipeline } from "@huggingface/transformers";

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

export async function embedText(text) {
  const extractor = await getExtractor();
  const safe = String(text || "").slice(0, 6000);
  const out = await extractor(safe, { pooling: "mean", normalize: true });
  return Array.from(out.data); // 384 dims
}