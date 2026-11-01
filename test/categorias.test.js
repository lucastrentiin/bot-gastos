import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriaPorPalavraChave, acharCategoria } from '../src/categorias.js';
import { classificar } from '../src/classificar.js';
import { abrirBanco } from '../src/db.js';

const esperado = {
  'mercado': 'Mercado',
  'Pão de Açúcar': 'Mercado',
  'pão': 'Alimentação',
  'ifood': 'Alimentação',
  'uber': 'Transporte',
  'gasolina posto shell': 'Transporte',
  'aluguel': 'Moradia',
  'conta de luz': 'Contas',
  'água de coco': 'Alimentação',
  'farmácia': 'Saúde',
  'netflix': 'Assinaturas',
  'tênis nike': 'Compras',
  'barbeiro': 'Cuidados pessoais',
  'ração': 'Pets',
  'curso alura': 'Educação',
  'cinema': 'Lazer',
};

for (const [desc, cat] of Object.entries(esperado)) {
  test(`"${desc}" -> ${cat}`, () => assert.equal(categoriaPorPalavraChave(desc), cat));
}

test('palavra dentro de outra não conta ("gasto" não é "gas")', () => {
  assert.equal(categoriaPorPalavraChave('gastos diversos'), null);
});

test('acharCategoria aceita sem acento, começo do nome e sinônimo', () => {
  assert.equal(acharCategoria('alimentacao'), 'Alimentação');
  assert.equal(acharCategoria('SAUDE'), 'Saúde');
  assert.equal(acharCategoria('cuidados'), 'Cuidados pessoais');
  assert.equal(acharCategoria('comida'), 'Alimentação');
  assert.equal(acharCategoria('xyz'), null);
});

test('classificar: aprendido > palavra-chave > IA > Outros', async () => {
  const repo = abrirBanco(':memory:');
  let chamadasIA = 0;
  const ia = async () => { chamadasIA++; return 'Lazer'; };
  const semIA = async () => null;

  assert.deepEqual(await classificar(repo, 'uber', 20, { ia }), { categoria: 'Transporte', origem: 'palavra-chave' });
  assert.equal(chamadasIA, 0);

  assert.deepEqual(await classificar(repo, 'paintball', 80, { ia }), { categoria: 'Lazer', origem: 'ia' });
  assert.equal(chamadasIA, 1);
  // segunda vez usa o que aprendeu, sem chamar a IA
  assert.deepEqual(await classificar(repo, 'Paintball', 80, { ia }), { categoria: 'Lazer', origem: 'aprendido' });
  assert.equal(chamadasIA, 1);

  // correção exata vale mais que palavra-chave
  repo.aprender('uber', 'Lazer');
  assert.equal((await classificar(repo, 'uber', 20, { ia })).categoria, 'Lazer');

  assert.deepEqual(await classificar(repo, 'zzz coisa', 5, { ia: semIA }), { categoria: 'Outros', origem: 'padrao' });
});

test('pix para pessoa: aprende o destinatário', async () => {
  const repo = abrirBanco(':memory:');
  const semIA = async () => null;
  assert.equal((await classificar(repo, 'pix joão', 50, { ia: semIA })).categoria, 'Outros');
  repo.aprender('pix joao', 'Lazer'); // o que "mudar 1 lazer" faz
  assert.equal((await classificar(repo, 'pix joão', 30, { ia: semIA })).categoria, 'Lazer');
  assert.equal((await classificar(repo, 'pix pro João', 30, { ia: semIA })).categoria, 'Lazer');
  assert.equal((await classificar(repo, 'pix para o joao', 30, { ia: semIA })).categoria, 'Lazer');
  assert.equal((await classificar(repo, 'pix joão sábado', 30, { ia: semIA })).categoria, 'Lazer');
  // se disser o que comprou, a palavra-chave ganha
  assert.equal((await classificar(repo, 'pix joão bolo', 40, { ia: semIA })).categoria, 'Alimentação');
});

test('IA respondendo "Outros" não é guardado como aprendido', async () => {
  const repo = abrirBanco(':memory:');
  const r = await classificar(repo, 'pix maria', 25, { ia: async () => 'Outros' });
  assert.deepEqual(r, { categoria: 'Outros', origem: 'padrao' });
  assert.equal(repo.todosAprendidos().length, 0);
});
