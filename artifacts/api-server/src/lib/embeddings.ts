/**
 * Local, key-free text embeddings via @huggingface/transformers
 * (all-MiniLM-L6-v2, 384-dim, mean-pooled + normalized).
 *
 * Neither the OpenAI nor Gemini Replit AI integrations expose an embeddings
 * endpoint, so the catalogue's semantic search runs entirely on a local ONNX
 * model. The model weights are downloaded once from the HF hub and cached on
 * disk; the pipeline is lazily instantiated and memoized for the process.
 */

export const EMBEDDING_DIMENSIONS = 384;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

type ExtractorOutput = { data: Float32Array; dims: number[] };
type Extractor = (
  input: string | string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<ExtractorOutput>;

let pipelinePromise: Promise<Extractor> | null = null;

async function getPipeline(): Promise<Extractor> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const extractor = await pipeline("feature-extraction", MODEL_ID);
      return extractor as unknown as Extractor;
    })();
  }
  return pipelinePromise;
}

/** Embed a single string into a 384-dim unit vector. */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/** Embed many strings in one batched forward pass. */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  const dim = output.dims[output.dims.length - 1] ?? EMBEDDING_DIMENSIONS;
  const rows: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    rows.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return rows;
}

/** Warm the model so the first user request is not slow. */
export async function warmEmbeddings(): Promise<void> {
  await embed("warmup");
}
