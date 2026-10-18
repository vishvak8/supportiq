import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const endpoint = () =>
  (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

const hostedProvider = () => process.env.AI_PROVIDER === 'openai';
const geminiProvider = () => process.env.AI_PROVIDER === 'gemini';
const openAIEndpoint = 'https://api.openai.com/v1';
const requireAiEnabled = () => {
  if (process.env.AI_PROVIDER === 'disabled')
    throw new ServiceUnavailableException(
      'AI drafting and semantic search are disabled in the public $0 demo. Run SupportIQ locally with Ollama to use AI features.',
    );
};

async function geminiRequest(model: string, action: string, body: unknown) {
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    throw new ServiceUnavailableException(
      'Gemini is not configured. Add a Free-tier GEMINI_API_KEY on the server.',
    );
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        },
      );
    } catch {
      if (!attempt) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      throw new ServiceUnavailableException(
        'Gemini is temporarily unavailable. Please try again shortly.',
      );
    }
    if (response.ok) return response.json() as Promise<Record<string, unknown>>;
    // A 429 indicates exhausted account quota; retrying cannot restore it.
    if (response.status === 429)
      throw new ServiceUnavailableException(
        'Gemini free-tier quota is temporarily exhausted. Please try again later.',
      );
    if ([500, 502, 503, 504].includes(response.status) && !attempt) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      continue;
    }
    throw new ServiceUnavailableException(
      'Gemini is temporarily unavailable. Please try again shortly.',
    );
  }
  throw new ServiceUnavailableException(
    'Gemini is temporarily unavailable. Please try again shortly.',
  );
}

async function openAIRequest(path: string, body: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    throw new ServiceUnavailableException(
      'Hosted AI is not configured. Set OPENAI_API_KEY in the deployment environment.',
    );
  const response = await fetch(`${openAIEndpoint}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  }).catch(() => null);
  if (!response?.ok)
    throw new ServiceUnavailableException(
      'Hosted AI provider is unavailable. Check provider configuration and service status.',
    );
  return response.json() as Promise<Record<string, unknown>>;
}

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

  async embed(input: string[], purpose: 'query' | 'document' = 'query') {
    requireAiEnabled();
    if (geminiProvider()) {
      const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
      const embeddings: (number[] | undefined)[] = [];
      for (let offset = 0; offset < input.length; offset += 50) {
        const batch = input
          .slice(offset, offset + 50)
          .map((text) =>
            purpose === 'document'
              ? text.startsWith('title:')
                ? text
                : `title: none | text: ${text}`
              : `task: search result | query: ${text}`,
          );
        const data = await geminiRequest(model, 'batchEmbedContents', {
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            embedContentConfig: { outputDimensionality: 768 },
          })),
        });
        const rows = data.embeddings as { values?: number[] }[] | undefined;
        embeddings.push(...(rows || []).map((row) => row.values));
      }
      if (
        embeddings.length !== input.length ||
        embeddings.some(
          (v) => !v || v.length !== 768 || v.some((n) => !Number.isFinite(n)),
        )
      )
        throw new ServiceUnavailableException(
          'The configured Gemini embedding model must return finite 768-dimensional vectors.',
        );
      return embeddings as number[][];
    }
    if (hostedProvider()) {
      const embeddings: (number[] | undefined)[] = [];
      // Keep batched document ingestion below the provider's aggregate input
      // limit even when one document produces hundreds of overlapping chunks.
      for (let offset = 0; offset < input.length; offset += 200) {
        const batch = input.slice(offset, offset + 200);
        const data = await openAIRequest('embeddings', {
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          dimensions: 768,
          input: batch,
        });
        const rows = data.data as
          { embedding?: number[]; index?: number }[] | undefined;
        const vectors = rows
          ?.slice()
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((row) => row.embedding);
        embeddings.push(...(vectors || []));
      }
      if (
        embeddings.length !== input.length ||
        embeddings.some(
          (v) => !v || v.length !== 768 || v.some((n) => !Number.isFinite(n)),
        )
      )
        throw new ServiceUnavailableException(
          'The configured embedding model must return finite 768-dimensional vectors.',
        );
      return embeddings as number[][];
    }
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
    requireAiEnabled();
    if (geminiProvider()) {
      const sourceIds: string[] = [];
      try {
        const prompt = JSON.parse(
          messages.find((message) => message.role === 'user')?.content || '{}',
        ) as { sources?: { id?: unknown }[] };
        sourceIds.push(
          ...(prompt.sources || [])
            .map((source) => source.id)
            .filter((id): id is string => typeof id === 'string'),
        );
      } catch {
        // Citation IDs are validated against the database by the caller.
      }
      const schema = {
        type: 'OBJECT',
        properties: {
          body: { type: 'STRING' },
          citations: {
            type: 'ARRAY',
            items: {
              type: 'STRING',
              ...(sourceIds.length ? { enum: sourceIds } : {}),
            },
          },
        },
        required: ['body', 'citations'],
      };
      const data = await geminiRequest(
        process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite',
        'generateContent',
        {
          systemInstruction: {
            parts: [
              {
                text:
                  messages.find((message) => message.role === 'system')
                    ?.content || '',
              },
            ],
          },
          contents: messages
            .filter((message) => message.role === 'user')
            .map((message) => ({
              role: 'user',
              parts: [{ text: message.content.slice(0, 24000) }],
            })),
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        },
      );
      const candidates = data.candidates as
        { content?: { parts?: { text?: string }[] } }[] | undefined;
      const content = candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('');
      if (!content)
        throw new ServiceUnavailableException(
          'Gemini returned no draft. Please try again shortly.',
        );
      return content;
    }
    if (hostedProvider()) {
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
      const data = await openAIRequest('chat/completions', {
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-6-luna',
        messages,
        max_completion_tokens: 1200,
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'support_reply',
            strict: true,
            schema: outputSchema,
          },
        },
      });
      const choices = data.choices as
        { message?: { content?: string } }[] | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content)
        throw new ServiceUnavailableException(
          'Hosted AI provider returned no draft.',
        );
      return content;
    }
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
