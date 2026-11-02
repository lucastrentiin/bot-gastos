import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { processarComprovante } from '../src/comandos.js';
import { lerComprovanteGemini } from '../src/comprovante.js';
import { midiaDaMensagem } from '../src/whatsapp.js';
import { abrirBanco } from '../src/db.js';

const HOJE = '2026-11-10';
const arquivo = { buffer: Buffer.from('fake'), mime: 'image/jpeg', legenda: '' };
const lendo = (r) => async () => r;
const enviar = (repo, lido, legenda = '', extra = {}) =>
  processarComprovante(repo, { ...arquivo, legenda }, { hoje: HOJE, ler: lendo(lido), ...extra });

afterEach(() => { delete process.env.GEMINI_API_KEY; });

test('pix para mercado: anota valor, recebedor, data e categoria', async () => {
  const repo = abrirBanco(':memory:');
  const r = await enviar(repo, { eh_comprovante: true, valor: 87.5, recebedor: 'SUPERMERCADO BOM PRECO LTDA', data: '2026-11-09', categoria: 'Mercado' });
  assert.match(r, /Comprovante anotado/);
  assert.match(r, /Supermercado Bom Preco: \*R\$\s?87,50\* → Mercado \(09\/11\)/);
  const g = repo.ultimoGasto();
  assert.equal(g.data, '2026-11-09');
  assert.equal(g.categoria, 'Mercado');
});

test('aprende o recebedor: na segunda vez não depende da IA', async () => {
  const repo = abrirBanco(':memory:');
  await enviar(repo, { eh_comprovante: true, valor: 50, recebedor: 'Padaria Pão Quente', data: '', categoria: 'Alimentação' });
  const r = await enviar(repo, { eh_comprovante: true, valor: 12, recebedor: 'Padaria Pão Quente', data: '', categoria: 'Outros' });
  assert.match(r, /Alimentação/);
});

test('pix para pessoa: Outros com dica; depois de "mudar" reconhece', async () => {
  const repo = abrirBanco(':memory:');
  const pix = { eh_comprovante: true, valor: 40, recebedor: 'JOAO DA SILVA', data: '', categoria: 'Outros' };
  const r1 = await enviar(repo, pix);
  assert.match(r1, /Outros/);
  assert.match(r1, /mudar 1 lazer/);
  repo.aprender('joao silva', 'Lazer'); // efeito de "mudar 1 lazer"
  assert.match(await enviar(repo, { ...pix, valor: 30 }), /Lazer/);
});

test('legenda ajuda a categorizar e entra na descrição', async () => {
  const repo = abrirBanco(':memory:');
  const r = await enviar(repo, { eh_comprovante: true, valor: 40, recebedor: 'Maria Souza', data: '', categoria: 'Outros' }, 'bolo');
  assert.match(r, /bolo \(Maria Souza\).*Alimentação/);
});

test('mesmo comprovante duas vezes avisa', async () => {
  const repo = abrirBanco(':memory:');
  const lido = { eh_comprovante: true, valor: 25, recebedor: 'Posto Shell', data: '2026-11-10', categoria: 'Transporte' };
  await enviar(repo, lido);
  assert.match(await enviar(repo, lido), /Parece repetido.*#1.*apagar 2/s);
});

test('data no futuro ou absurda vira hoje; CPF some do nome', async () => {
  const repo = abrirBanco(':memory:');
  await enviar(repo, { eh_comprovante: true, valor: 10, recebedor: 'Ana Lima ***.123.456-**', data: '2027-05-01', categoria: 'Outros' });
  const g = repo.ultimoGasto();
  assert.equal(g.data, HOJE);
  assert.equal(g.descricao, 'Ana Lima');
});

test('não é comprovante / sem valor', async () => {
  const repo = abrirBanco(':memory:');
  assert.match(await enviar(repo, { eh_comprovante: false, valor: 0, recebedor: '', data: '', categoria: 'Outros' }), /Não achei um valor/);
  assert.equal(repo.ultimosGastos().length, 0);
});

test('erro da IA não derruba o bot', async () => {
  const repo = abrirBanco(':memory:');
  const r = await processarComprovante(repo, arquivo, { hoje: HOJE, ler: async () => { throw new Error('503'); } });
  assert.match(r, /Não consegui ler/);
});

test('sem chave do Gemini explica como configurar', async () => {
  const repo = abrirBanco(':memory:');
  const r = await processarComprovante(repo, arquivo, { hoje: HOJE });
  assert.match(r, /bot-gastos config/);
});

test('pedido ao Gemini leva a imagem e pede JSON', async () => {
  process.env.GEMINI_API_KEY = 'teste';
  const original = globalThis.fetch;
  let corpo;
  globalThis.fetch = async (url, opts) => {
    corpo = JSON.parse(opts.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"eh_comprovante":true,"valor":12.5,"recebedor":"X","data":"","categoria":"Outros"}' }] } }] }));
  };
  try {
    const r = await lerComprovanteGemini(Buffer.from('abc'), 'application/pdf', 'bolo');
    assert.equal(r.valor, 12.5);
    assert.equal(corpo.contents[0].parts[0].inlineData.mimeType, 'application/pdf');
    assert.equal(corpo.contents[0].parts[0].inlineData.data, Buffer.from('abc').toString('base64'));
    assert.match(corpo.contents[0].parts[1].text, /bolo/);
    assert.equal(corpo.generationConfig.responseMimeType, 'application/json');
  } finally {
    globalThis.fetch = original;
  }
});

test('reconhece print, PDF e ignora outros arquivos', () => {
  assert.deepEqual(midiaDaMensagem({ imageMessage: { mimetype: 'image/jpeg', caption: 'bolo' } }), { mime: 'image/jpeg', legenda: 'bolo' });
  assert.deepEqual(midiaDaMensagem({ documentMessage: { mimetype: 'application/pdf' } }), { mime: 'application/pdf', legenda: '' });
  assert.deepEqual(
    midiaDaMensagem({ documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/pdf', caption: 'luz' } } } }),
    { mime: 'application/pdf', legenda: 'luz' },
  );
  assert.equal(midiaDaMensagem({ documentMessage: { mimetype: 'application/zip' } }), null);
  assert.equal(midiaDaMensagem({ conversation: 'oi' }), null);
});
