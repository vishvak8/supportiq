import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const endpoint = () =>
  (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

@Injectable()
export class OllamaProvider {
  private embeddingModel() {
    const model = process.env.OLLAMA_EMBEDDING_MODEL;
    if (!model)
      throw new ServiceUnavailableException(
        'Set OLLAMA_EMBEDDING_MODEL after installing an embedding model locally.',
      );
    return model;
  }

  async embed(input: string[]) {
    const response = await fetch(`${endpoint()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel(), input }),
      signal: AbortSignal.timeout(45000),
    }).catch(() => null);
    if (!response?.ok)
      throw new ServiceUnavailableException(
        'Local embedding provider is unavailable. Check Ollama and the configured embedding model.',
      );
    const data = (await response.json().catch(() => null)) as {
      embeddings?: number[][];
    } | null;
    if (
      !data?.embeddings ||
      data.embeddings.length !== input.length ||
      data.embeddings.some(
        (v) => v.length !== 768 || v.some((n) => !Number.isFinite(n)),
      )
    )
      throw new ServiceUnavailableException(
        'The configured embedding model must return finite 768-dimensional vectors.',
      );
    return data.embeddings;
  }

  async draft(messages: { role: 'system' | 'user'; content: string }[]) {
    const model = process.env.OLLAMA_CHAT_MODEL;
    if (!model)
      throw new ServiceUnavailableException(
        'Set OLLAMA_CHAT_MODEL after installing a local chat model.',
      );
    let sourceIds: string[] = [];
    try {
      const prompt = JSON.parse(
        messages.find((message) => message.role === 'user')?.content || '{}',
      ) as { sources?: { id?: unknown }[] };
      sourceIds = (prompt.sources || [])
        .map((source) => source.id)
        .filter((id): id is string => typeof id === 'string');
    } catch {
      // The API validates the response again against the retrieved source set.
    }
    const outputSchema = {
      type: 'object',
      properties: {
        body: { type: 'string' },
        citations: {
          type: 'array',
          items: {
            type: 'string',
            ...(sourceIds.length ? { enum: sourceIds } : {}),
          },
          maxItems: 5,
        },
      },
      required: ['body', 'citations'],
      additionalProperties: false,
    };
    const response = await fetch(`${endpoint()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        format: outputSchema,
        stream: false,
        // Bound KV-cache memory on the 18 GB local development machine.
        options: { temperature: 0.2, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(90000),
    }).catch(() => null);
    if (!response?.ok)
      throw new ServiceUnavailableException(
        'Local chat provider is unavailable. Check Ollama and the configured chat model.',
      );
    const data = (await response.json().catch(() => null)) as {
      message?: { content?: string };
    } | null;
    if (!data?.message?.content)
      throw new ServiceUnavailableException(
        'Local chat provider returned no draft.',
      );
    return data.message.content;
  }
}
