import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarMensagem } from '../src/comandos.js';
import { abrirBanco } from '../src/db.js';

const HOJE = '2026-11-10';
const semIA = async () => null;
const enviar = (repo, texto, hoje = HOJE) => processarMensagem(repo, texto, { hoje, ia: semIA });

test('registra gasto e responde com categoria e total', async () => {
  const repo = abrirBanco(':memory:');
  const r = await enviar(repo, 'mercado 87,50');
  assert.match(r, /Anotado/);
  assert.match(r, /R\$\s?87,50/);
  assert.match(r, /Mercado/);
  assert.match(r, /#1/);
  assert.equal(repo.ultimoGasto().categoria, 'Mercado');
});

test('todas as respostas começam com 🤖 (evita loop)', async () => {
  const repo = abrirBanco(':memory:');
  for (const msg of ['ajuda', 'mercado 10', 'resumo', 'relatorio', 'hoje', 'semana', 'ultimos', 'xpto',
    'desfazer', 'orcamento', 'renda', 'categorias', 'buscar x', 'mudar 99 lazer']) {
    const r = await enviar(repo, msg);
    assert.ok(r.startsWith('🤖'), `"${msg}" -> ${r.slice(0, 30)}`);
  }
});

test('várias linhas viram vários gastos', async () => {
  const repo = abrirBanco(':memory:');
  const r = await enviar(repo, 'uber 20\nifood 35\npadaria 8');
  assert.match(r, /3 gastos anotados/);
  assert.equal(repo.ultimosGastos(10).length, 3);
});

test('gasto desconhecido vai para Outros com dica de correção, e "mudar" ensina', async () => {
  const repo = abrirBanco(':memory:');
  const r = await enviar(repo, 'paintball 80');
  assert.match(r, /Outros/);
  assert.match(r, /mudar 1 lazer/);

  const m = await enviar(repo, 'mudar 1 lazer');
  assert.match(m, /Lazer/);
  assert.equal(repo.gasto(1).categoria, 'Lazer');

  const r2 = await enviar(repo, 'paintball 60');
  assert.match(r2, /Lazer/);
});

test('desfazer e apagar', async () => {
  const repo = abrirBanco(':memory:');
  await enviar(repo, 'uber 20');
  await enviar(repo, 'ifood 30');
  assert.match(await enviar(repo, 'desfazer'), /ifood/);
  assert.equal(repo.ultimosGastos().length, 1);
  assert.match(await enviar(repo, 'apagar 1'), /uber/);
  assert.equal(repo.ultimosGastos().length, 0);
});

test('orçamento avisa em 80% e ao estourar', async () => {
  const repo = abrirBanco(':memory:');
  assert.match(await enviar(repo, 'orcamento alimentacao 100'), /R\$\s?100,00/);
  assert.doesNotMatch(await enviar(repo, 'ifood 50'), /orçamento/);
  assert.match(await enviar(repo, 'ifood 35'), /85% do orçamento/);
  assert.match(await enviar(repo, 'ifood 20'), /Estourou/);
  assert.match(await enviar(repo, 'orcamento'), /❌ Alimentação/);
});

test('"hoje padaria 10" registra gasto em vez de mostrar resumo', async () => {
  const repo = abrirBanco(':memory:');
  assert.match(await enviar(repo, 'hoje padaria 10'), /Anotado/);
});

test('mensagem sem sentido explica como usar', async () => {
  const repo = abrirBanco(':memory:');
  assert.match(await enviar(repo, 'bom dia'), /Não entendi/);
});

test('relatório do mês passado com comparação e dicas', async () => {
  const repo = abrirBanco(':memory:');
  await enviar(repo, 'renda 3000');
  // setembro
  for (const l of ['05/09 mercado 400', '10/09 ifood 40', '12/09 uber 30']) await enviar(repo, l, '2026-10-01');
  // outubro
  const outubro = [
    '01/10 aluguel 1.200', '03/10 mercado 450', '05/10 ifood 55', '07/10 ifood 48', '09/10 ifood 62',
    '10/10 ifood 39', '12/10 netflix 55,90', '12/10 spotify 21,90', '15/10 uber 25', '20/10 farmácia 80',
    '25/10 cinema 60', '28/10 padaria 12',
  ];
  for (const l of outubro) await enviar(repo, l, '2026-10-31');

  const r = await enviar(repo, 'relatorio');
  assert.match(r, /Relatório de outubro de 2026/);
  assert.match(r, /Total: R\$\s?2\.108,80/);
  assert.match(r, /a mais que setembro/);
  assert.match(r, /Por categoria/);
  assert.match(r, /Moradia/);
  assert.match(r, /Maiores gastos/);
  assert.match(r, /aluguel/);
  assert.match(r, /4 pedidos de delivery/);
  assert.match(r, /Onde dá pra economizar/);
  assert.match(r, /da renda/);

  const set = await enviar(repo, 'relatorio setembro');
  assert.match(set, /setembro de 2026/);
  assert.match(set, /R\$\s?470,00/);
});

test('resumo do mês atual mostra projeção', async () => {
  const repo = abrirBanco(':memory:');
  await enviar(repo, 'mercado 100');
  const r = await enviar(repo, 'resumo');
  assert.match(r, /Parcial de novembro/);
  assert.match(r, /mês fecha em/);
});
