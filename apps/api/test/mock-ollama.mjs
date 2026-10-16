import { createServer } from 'node:http';

function deterministicEmbedding(text) {
  const vector = Array(768).fill(0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    let hash = 2166136261;
    for (const character of token) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const index = (hash >>> 0) % vector.length;
    vector[index] += hash & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => value / norm) : vector;
}

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
    : {};
  response.setHeader('content-type', 'application/json');
  if (request.url === '/health') {
    response.end(JSON.stringify({ status: 'ready' }));
    return;
  }
  if (request.url === '/api/embed') {
    const values = Array.isArray(body.input) ? body.input : [body.input];
    response.end(
      JSON.stringify({ embeddings: values.map(deterministicEmbedding) }),
    );
    return;
  }
  if (request.url === '/api/chat') {
    let payload = {};
    try {
      payload = JSON.parse(body.messages?.[1]?.content || '{}');
    } catch {
      response.statusCode = 400;
      response.end(
        JSON.stringify({ error: 'Invalid deterministic test prompt' }),
      );
      return;
    }
    const source = payload.sources?.[0];
    const generated = {
      body: source
        ? 'Please review your saved billing address in account settings and save the change before checkout.'
        : 'I could not find enough verified information. Please review this request manually.',
      citations: source ? [source.id] : [],
    };
    response.end(
      JSON.stringify({ message: { content: JSON.stringify(generated) } }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(Number(process.env.MOCK_OLLAMA_PORT || 4141), '127.0.0.1');
