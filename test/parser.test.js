import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerLinha, lerGastos, lerNumero } from '../src/parser.js';

const HOJE = '2026-11-10';

test('números no formato brasileiro', () => {
  assert.equal(lerNumero('87,50'), 87.5);
  assert.equal(lerNumero('87.50'), 87.5);
  assert.equal(lerNumero('1.200'), 1200);
  assert.equal(lerNumero('1.200,90'), 1200.9);
  assert.equal(lerNumero('23'), 23);
});

const casos = [
  ['mercado 87,50', 87.5, 'mercado', HOJE],
  ['87,50 mercado', 87.5, 'mercado', HOJE],
  ['uber 23', 23, 'uber', HOJE],
  ['R$ 1.200,00 aluguel', 1200, 'aluguel', HOJE],
  ['aluguel 1.200', 1200, 'aluguel', HOJE],
  ['ifood 45.90', 45.9, 'ifood', HOJE],
  ['gasolina 200 reais', 200, 'gasolina', HOJE],
  ['gastei 30 no mercado', 30, 'mercado', HOJE],
  ['paguei 150 de luz', 150, 'luz', HOJE],
  ['pão de queijo 8', 8, 'pão de queijo', HOJE],
  ['2 pizzas 80', 80, '2 pizzas', HOJE],
  ['ontem padaria 12,30', 12.3, 'padaria', '2026-11-09'],
  ['anteontem uber 18', 18, 'uber', '2026-11-08'],
  ['15/10 farmácia 32', 32, 'farmácia', '2026-10-15'],
  ['farmácia 32 dia 5', 32, 'farmácia', '2026-11-05'],
  ['cinema dia 20 45', 45, 'cinema', '2026-10-20'], // dia 20 ainda não chegou -> mês passado
  ['netflix - 55,90', 55.9, 'netflix', HOJE],
];

for (const [entrada, valor, descricao, data] of casos) {
  test(`lê "${entrada}"`, () => {
    assert.deepEqual(lerLinha(entrada, HOJE), { valor, descricao, data });
  });
}

test('28/12 em janeiro é do ano passado', () => {
  assert.equal(lerLinha('presente 100 28/12', '2027-01-05').data, '2026-12-28');
});

test('linhas sem valor ou sem descrição são rejeitadas', () => {
  assert.equal(lerLinha('mercado', HOJE), null);
  assert.equal(lerLinha('50', HOJE), null);
  assert.equal(lerLinha('obrigado', HOJE), null);
});

test('vários gastos, um por linha', () => {
  const { gastos, linhasRuins } = lerGastos('mercado 100\nuber 20\nqualquer coisa\n\nifood 35,5', HOJE);
  assert.equal(gastos.length, 3);
  assert.deepEqual(gastos.map((g) => g.valor), [100, 20, 35.5]);
  assert.deepEqual(linhasRuins, ['qualquer coisa']);
});
