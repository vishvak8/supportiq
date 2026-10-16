# Local Ollama setup

AI is optional. Ticket intake, replies, team actions, file downloads and reports work without it. Knowledge documents can be created without Ollama, but ingestion remains queued until an embedding model is configured and reachable. Search and cited drafting require an indexed current-generation document.

## Verified local model configuration

Local verification on 2026-10-16 used `llama3.1:8b` (already installed, 4.9 GB) for generation and `nomic-embed-text:latest` (approved download, 274 MB) for embeddings on an 18 GB MacBook Pro M3 Pro. Real `/api/embed` requests returned finite 768-dimensional vectors matching SupportIQ's pgvector column. Generation used temperature 0.2 and an 8,192-token context. Model sizes exclude runtime/context memory and may change as tags are updated. The repository does not download models automatically.

```sh
ollama pull nomic-embed-text:latest
ollama pull llama3.1:8b
```

Set these values in the ignored local `.env` (also documented in `.env.example`):

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
OLLAMA_CHAT_MODEL=llama3.1:8b
```

Restart the API after configuring it. The ingestion worker retries transient failures with bounded backoff; failed documents can also be retried from the Knowledge Base. Changing embedding models requires re-indexing documents and preserving the 768-dimensional vector contract. The API uses an Ollama structured-output schema that constrains citation IDs to retrieved sources, then validates those IDs against current generations again. The 0.50 Nomic similarity cutoff is based on a small local synthetic probe; recalibrate against a representative corpus before production or changing embedding models. The current schema stores vector dimension but not a model-version fingerprint. Do not silently switch embedding models while retaining old chunks; re-index every document after a model change.

If the API later runs in a container, `127.0.0.1` refers to that container. Configure a reachable private Ollama endpoint, restrict access to the application network, and avoid exposing Ollama to the public internet. Do not send customer data to an external provider without a separate privacy/security decision.

## Evaluation boundary

`apps/api/test/ai-evaluation.json` records five deterministic regression cases: answerable, unsupported, hostile source prompt injection, cross-organisation isolation, and deleted/replaced source generations. API tests verify workflow behavior, tenant filters, private-note exclusion, citation validation, customer-facing output checks, durable retries, and explicit approval/send. Live local observations for answerable, unsupported, hostile-source, and invoice wording scenarios—including the initial cutoff/output issues and final results—are in [AI evaluation results](ai-evaluation-results.md). The live sample is small and does not prove broad answer quality or prompt-injection resistance. Deterministic security checks are separate from live-model results.

Current model metadata: [Ollama nomic-embed-text library](https://ollama.com/library/nomic-embed-text), [Nomic output-dimension details](https://www.nomic.ai/news/nomic-embed-matryoshka), and [Ollama llama3.1 tags](https://ollama.com/library/llama3.1/tags). Recheck model license, upstream status, exact tag size, memory demand, and suitability before use.
