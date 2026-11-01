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

  repo.aprender('uber', 'Lazer');
  assert.equal((await classificar(repo, 'uber centro', 20, { ia })).categoria, 'Lazer');

  assert.deepEqual(await classificar(repo, 'zzz coisa', 5, { ia: semIA }), { categoria: 'Outros', origem: 'padrao' });
});
