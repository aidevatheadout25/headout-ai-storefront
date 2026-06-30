---
name: Replit AI integrations don't do embeddings
description: Neither the OpenAI nor Gemini Replit AI integration exposes an embeddings endpoint; use a local model for key-free vector search.
---

Both the OpenAI and the Gemini Replit AI integration skills list the **embeddings
API under "Unsupported Capabilities"**. The Replit AI integration proxy only does
chat/completions (and, for Gemini, image gen) — there is no key-free embeddings
endpoint from either provider.

**Why:** This matters whenever a task spec says "use the X Replit integration for
embeddings" (e.g. semantic search / pgvector catalogues). That instruction is not
satisfiable via the Replit integration — it was likely written assuming one
provider supports it. Confirm against the integration skill's "Unsupported
Capabilities" section before wiring it up.

**How to apply:** For key-free embeddings, run a local model
(`@huggingface/transformers`, e.g. `Xenova/all-MiniLM-L6-v2`, 384-dim) — weights
download once and cache on disk. Only reach for cloud embeddings (OpenAI/Gemini
*direct* with the user's own API key) if the user explicitly wants it, since that
re-introduces a required secret. Keep the pgvector column dimension in lockstep
with whatever model you pick.
