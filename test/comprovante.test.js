import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { processarComprovante } from '../src/comandos.js';
import { lerComprovanteGemini } from '../src/comprovante.js';
import { midiaDaMensagem } from '../src/whatsapp.js';
import { abrirBanco } from '../src/db.js';

process.env.GEMINI_ESPERA_MS = '0';
process.env.GEMINI_DESCOBRIR = '0';
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

test('mesmo comprovante duas vezes não duplica', async () => {
  const repo = abrirBanco(':memory:');
  const lido = { eh_comprovante: true, valor: 25, recebedor: 'Posto Shell', data: '2026-11-10', categoria: 'Transporte' };
  await enviar(repo, lido);
  assert.match(await enviar(repo, lido), /Nada novo.*já estava anotado/s);
  assert.equal(repo.ultimosGastos().length, 1);
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
  assert.match(await enviar(repo, { eh_comprovante: false, valor: 0, recebedor: '', data: '', categoria: 'Outros' }), /Não achei nenhum pagamento/);
  assert.equal(repo.ultimosGastos().length, 0);
});

test('erro da IA não derruba o bot', async () => {
  const repo = abrirBanco(':memory:');
  const r = await processarComprovante(repo, arquivo, { hoje: HOJE, ler: async () => { throw new Error('503'); } });
  assert.match(r, /Não consegui ler/);
  assert.match(r, /Gemini/);
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
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"transacoes":[{"valor":12.5,"recebedor":"X","data":"","hora":"","categoria":"Outros"}]}' }] } }] }));
  };
  try {
    const r = await lerComprovanteGemini(Buffer.from('abc'), 'application/pdf', 'bolo');
    assert.equal(r.transacoes[0].valor, 12.5);
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

test('legenda ensina o recebedor: próximo Pix sem legenda já reconhece', async () => {
  const repo = abrirBanco(':memory:');
  const maria = { eh_comprovante: true, valor: 40, recebedor: 'MARIA SOUZA', data: '', categoria: 'Outros' };
  assert.match(await enviar(repo, maria, 'bolo'), /Alimentação/);
  assert.match(await enviar(repo, { ...maria, valor: 35 }), /Maria Souza: \*R\$\s?35,00\* → Alimentação/);
  // legenda diferente ainda manda: compra outra coisa da mesma pessoa
  assert.match(await enviar(repo, { ...maria, valor: 20 }, 'farmácia'), /Saúde/);
});

test('"mudar" em comprovante com legenda também ensina o recebedor', async () => {
  const repo = abrirBanco(':memory:');
  const joao = { eh_comprovante: true, valor: 50, recebedor: 'JOAO PEREIRA', data: '', categoria: 'Outros' };
  await enviar(repo, joao, 'aula de violao'); // legenda sem palavra-chave conhecida -> Outros
  const { processarMensagem } = await import('../src/comandos.js');
  await processarMensagem(repo, 'mudar 1 educacao', { hoje: HOJE, ia: async () => null });
  assert.match(await enviar(repo, { ...joao, valor: 45 }), /Joao Pereira: .*Educação/);
});


// Os 4 prints da tela de notificações do Itaú que o Lucas mandou (02/11/2026), já como o Gemini devolve
const tx = (valor, recebedor, data, hora, categoria) => ({ valor, recebedor, data, hora, categoria });
const PRINTS = [
  { transacoes: [
    tx(23.64, '99Food', '2026-11-01', '23:00', 'Alimentação'),
    tx(115, 'Milena', '2026-11-01', '19:13', 'Outros'),
    tx(68.57, '99Food', '2026-10-31', '20:09', 'Alimentação'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
  ] },
  { transacoes: [
    tx(115, 'Milena', '2026-11-01', '19:13', 'Outros'),
    tx(68.57, '99Food', '2026-10-31', '20:09', 'Alimentação'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
  ] },
  { transacoes: [
    tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
    tx(10.98, '99Food', '2026-10-30', '12:22', 'Alimentação'),
    tx(257.25, 'Policia Federal/MJ', '2026-10-29', '08:46', 'Contas'),
  ] },
  { transacoes: [
    tx(257.25, 'Policia Federal/MJ', '2026-10-29', '08:46', 'Contas'),
    tx(120.37, 'Anthropic', '2026-10-24', '18:37', 'Assinaturas'),
  ] },
];

test('prints de notificações que se sobrepõem: anota tudo uma vez só', async () => {
  const repo = abrirBanco(':memory:');
  const hoje = '2026-11-02';
  const mandar = (lido) => processarComprovante(repo, arquivo, { hoje, ler: async () => lido });

  const r1 = await mandar(PRINTS[0]);
  assert.match(r1, /5 gastos anotados do print/);
  assert.match(r1, /Não sei a categoria de: #2 Milena/);

  const r2 = await mandar(PRINTS[1]);
  assert.match(r2, /2 gastos anotados/); // só os 2 boletos a mais
  assert.match(r2, /4 já estavam anotados/);

  const r3 = await mandar(PRINTS[2]);
  assert.match(r3, /2 gastos anotados/); // 99Food 10,98 e Polícia Federal

  const r4 = await mandar(PRINTS[3]);
  assert.match(r4, /Anthropic: \*R\$\s?120,37\* → Assinaturas \(24\/10\)/);

  const todos = repo.ultimosGastos(50);
  assert.equal(todos.length, 10);
  const soma = Math.round(todos.reduce((t, g) => t + g.valor, 0) * 100) / 100;
  assert.equal(soma, 1220.57);
  assert.equal(todos.filter((g) => g.descricao === 'Municipio De Chapeco').length, 4);
  assert.ok(todos.every((g) => g.hora));

  // mandar o mesmo print de novo não muda nada
  assert.match(await mandar(PRINTS[0]), /Nada novo nesse print: os 5 gastos já estavam anotados/);
});

test('print sem nenhum pagamento (só avisos/propaganda)', async () => {
  const repo = abrirBanco(':memory:');
  const r = await processarComprovante(repo, arquivo, { hoje: HOJE, ler: async () => ({ transacoes: [] }) });
  assert.match(r, /Não achei nenhum pagamento/);
});

test('prompt manda a data de hoje para o Gemini descobrir o ano', async () => {
  process.env.GEMINI_API_KEY = 'teste';
  const original = globalThis.fetch;
  let corpo;
  globalThis.fetch = async (url, opts) => {
    corpo = JSON.parse(opts.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"transacoes":[]}' }] } }] }));
  };
  try {
    await lerComprovanteGemini(Buffer.from('x'), 'image/png', '', '2026-11-02');
    const prompt = corpo.contents[0].parts[1].text;
    assert.match(prompt, /Hoje é 2026-11-02/);
    assert.match(prompt, /NÃO liste/);
    assert.equal(corpo.generationConfig.responseSchema.properties.transacoes.type, 'ARRAY');
  } finally {
    globalThis.fetch = original;
  }
});

test('"faça só a partir do dia 01/11": define data de início e ignora o que é antes', async () => {
  const repo = abrirBanco(':memory:');
  const hoje = '2026-11-03';
  const { processarMensagem } = await import('../src/comandos.js');
  const msg = (t) => processarMensagem(repo, t, { hoje, ia: async () => null });

  assert.match(await msg('cuide para não repetir. e faça só a partir do dia 01/11'), /só anoto gastos a partir de \*01\/11\/2026\*/);
  assert.match(await msg('inicio'), /a partir de 01\/11\/2026/);

  // print com itens de outubro e novembro
  const r = await processarComprovante(repo, arquivo, { hoje, ler: async () => PRINTS[0] });
  assert.match(r, /2 gastos anotados/); // só 99Food 01/11 e Milena 01/11
  assert.match(r, /Ignorei 3 de antes de 01\/11/);
  assert.equal(repo.ultimosGastos(50).length, 2);

  // print só com coisas de antes
  const r2 = await processarComprovante(repo, arquivo, { hoje, ler: async () => PRINTS[3] });
  assert.match(r2, /Nada para anotar.*Ignorei 2 de antes/s);

  // texto também respeita
  assert.match(await msg('31/10 mercado 50'), /Ignorei: esse gasto é de antes de 01\/11/);
  assert.match(await msg('31/10 mercado 50\n02/11 uber 20'), /Anotado[\s\S]*uber[\s\S]*Ignorei 1 de antes/);

  assert.match(await msg('inicio limpar'), /removida/);
  assert.match(await msg('31/10 mercado 50'), /Anotado/);
});

test('mostra o que o Gemini ignorou quando não há pagamento', async () => {
  const repo = abrirBanco(':memory:');
  const r = await processarComprovante(repo, arquivo, {
    hoje: HOJE,
    ler: async () => ({ transacoes: [], ignorados: ['boleto a vencer R$ 257,25', 'propaganda'] }),
  });
  assert.match(r, /Não achei nenhum pagamento/);
  assert.match(r, /Ignorei \(não é gasto pago\): boleto a vencer R\$ 257,25; propaganda/);
});

test('item sem data num print usa a data do vizinho, não "hoje"', async () => {
  const repo = abrirBanco(':memory:');
  await processarComprovante(repo, arquivo, {
    hoje: '2026-11-03',
    ler: async () => ({ transacoes: [
      tx(156.19, 'Municipio de Chapeco', '2026-10-30', '18:31', 'Contas'),
      tx(156.19, 'Municipio de Chapeco', '', '', 'Contas'),
    ] }),
  });
  assert.deepEqual(repo.ultimosGastos(5).map((g) => g.data), ['2026-10-30', '2026-10-30']);
});

test('apagar vários e apagar antes de uma data', async () => {
  const repo = abrirBanco(':memory:');
  const { processarMensagem } = await import('../src/comandos.js');
  const msg = (t) => processarMensagem(repo, t, { hoje: '2026-11-03', ia: async () => null });
  await msg('29/10 a 10\n30/10 b 20\n31/10 c 30\n01/11 d 40\n02/11 e 50');
  assert.match(await msg('apagar antes 01/11'), /Apaguei 3 gastos de antes de 01\/11 \(R\$\s?60,00\)/);
  assert.deepEqual(repo.ultimosGastos(9).map((g) => g.descricao), ['e', 'd']);
  assert.match(await msg('apagar 4 5 99'), /Apaguei 2[\s\S]*Não achei: #99/);
  assert.equal(repo.ultimosGastos(9).length, 0);
});

test('cenário do Lucas: 4 prints um depois do outro, início 01/11, sem duplicar', async () => {
  const repo = abrirBanco(':memory:');
  const hoje = '2026-11-03';
  const { processarMensagem } = await import('../src/comandos.js');
  await processarMensagem(repo, 'inicio 01/11', { hoje });
  for (const p of [PRINTS[3], PRINTS[1], PRINTS[0], PRINTS[2]]) {
    await processarComprovante(repo, arquivo, { hoje, ler: async () => p });
  }
  const todos = repo.ultimosGastos(50).map((g) => `${g.data} ${g.descricao} ${g.valor}`).sort();
  assert.deepEqual(todos, ['2026-11-01 99food 23.64', '2026-11-01 Milena 115']);
});
