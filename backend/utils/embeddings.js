import { pipeline } from "@huggingface/transformers";

let extractorPromise = null;

// all-MiniLM-L6-v2 -> 384 dims
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

export async function embedText(text) {
  const extractor = await getExtractor();
  const safe = String(text || "").slice(0, 6000);

  // mean pooling + normalized vector for cosine similarity
  const out = await extractor(safe, { pooling: "mean", normalize: true });

  return Array.from(out.data); // float[] length 384
}