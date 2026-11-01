import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { categorizarComIA, provedorIA } from '../src/ia.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

test('sem chave nenhuma, não usa IA', async () => {
  assert.equal(provedorIA(), null);
  assert.equal(await categorizarComIA('paintball', 80), null);
});

test('Gemini tem prioridade e a resposta é lida', async () => {
  process.env.GEMINI_API_KEY = 'teste';
  process.env.ANTHROPIC_API_KEY = 'teste';
  assert.equal(provedorIA(), 'gemini');
  let pedido;
  globalThis.fetch = async (url, opts) => {
    pedido = { url, opts };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"categoria":"Lazer"}' }] } }] }));
  };
  assert.equal(await categorizarComIA('paintball', 80), 'Lazer');
  assert.match(pedido.url, /generativelanguage\.googleapis\.com/);
  assert.equal(pedido.opts.headers['x-goog-api-key'], 'teste');
  const corpo = JSON.parse(pedido.opts.body);
  assert.ok(corpo.generationConfig.responseSchema.properties.categoria.enum.includes('Lazer'));
});

test('Gemini: categoria inventada ou erro HTTP viram null', async () => {
  process.env.GEMINI_API_KEY = 'teste';
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"categoria":"Viagem"}' }] } }] }));
  assert.equal(await categorizarComIA('x', 1), null);
  globalThis.fetch = async () => new Response('{"error":"bad key"}', { status: 400 });
  assert.equal(await categorizarComIA('x', 1), null);
});
