// Monta os textos de resumo e do relatório mensal.
import { emoji } from './categorias.js';
import { brl, nomeMes, mesAnterior, diasNoMes, diaMes, barra, hojeISO, mesDe, normalizar } from './util.js';

function somar(gastos) {
  return Math.round(gastos.reduce((s, g) => s + g.valor, 0) * 100) / 100;
}

/** { categoria: total }, ordenado do maior para o menor. */
export function totaisPorCategoria(gastos) {
  const t = {};
  for (const g of gastos) t[g.categoria] = (t[g.categoria] ?? 0) + g.valor;
  return Object.entries(t)
    .map(([categoria, total]) => ({ categoria, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

function variacao(atual, anterior) {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

function setinha(pct) {
  if (pct === null) return '';
  if (Math.abs(pct) < 1) return ' (=)';
  return pct > 0 ? ` (▲ ${pct.toFixed(0)}%)` : ` (▼ ${Math.abs(pct).toFixed(0)}%)`;
}

const RE_DELIVERY = /\b(ifood|i food|rappi|delivery|uber eats|ze delivery)\b/;

/** Dicas concretas de onde cortar, a partir dos números do mês. */
export function dicasDeEconomia({ gastos, porCategoria, total, porCategoriaAnterior, renda }) {
  const dicas = [];
  if (gastos.length === 0) return dicas;

  // 1. Categoria que mais cresceu em reais
  const anterior = Object.fromEntries((porCategoriaAnterior ?? []).map((c) => [c.categoria, c.total]));
  const crescimentos = porCategoria
    .filter((c) => anterior[c.categoria])
    .map((c) => ({ ...c, diff: c.total - anterior[c.categoria] }))
    .filter((c) => c.diff > 0)
    .sort((a, b) => b.diff - a.diff);
  if (crescimentos[0] && crescimentos[0].diff >= 50) {
    const c = crescimentos[0];
    dicas.push(
      `${emoji(c.categoria)} *${c.categoria}* foi o que mais subiu: ${brl(c.diff)} a mais que no mês anterior.`,
    );
  }

  // 2. Delivery
  const delivery = gastos.filter((g) => RE_DELIVERY.test(normalizar(g.descricao)));
  if (delivery.length >= 3) {
    const t = somar(delivery);
    dicas.push(
      `🛵 Foram ${delivery.length} pedidos de delivery (${brl(t)}). Trocar metade por comida feita em casa economiza perto de ${brl(t * 0.3)}.`,
    );
  }

  // 3. Gastinhos pequenos que somam
  const pequenos = gastos.filter((g) => g.valor < 30);
  const totalPequenos = somar(pequenos);
  if (pequenos.length >= 8 && totalPequenos >= total * 0.1) {
    dicas.push(
      `☕ ${pequenos.length} gastos abaixo de R$ 30 somaram ${brl(totalPequenos)} (${((totalPequenos / total) * 100).toFixed(0)}% do mês). São os que passam despercebidos.`,
    );
  }

  // 4. Assinaturas
  const assinaturas = porCategoria.find((c) => c.categoria === 'Assinaturas');
  if (assinaturas && assinaturas.total >= 50) {
    dicas.push(
      `📺 Assinaturas: ${brl(assinaturas.total)}/mês = ${brl(assinaturas.total * 12)} por ano. Vale cancelar a que você menos usa.`,
    );
  }

  // 5. Uma categoria dominando
  const maior = porCategoria[0];
  if (maior && maior.categoria !== 'Moradia' && maior.total / total >= 0.35 && porCategoria.length > 1) {
    dicas.push(
      `${emoji(maior.categoria)} *${maior.categoria}* sozinho levou ${((maior.total / total) * 100).toFixed(0)}% do que você gastou. Cortar 15% ali já são ${brl(maior.total * 0.15)}.`,
    );
  }

  // 6. Meta de guardar 20% da renda
  if (renda) {
    const meta = renda * 0.8;
    if (total > meta) {
      dicas.push(
        `🎯 Para guardar 20% da renda, o teto de gastos seria ${brl(meta)}. Você passou ${brl(total - meta)} disso.`,
      );
    } else {
      dicas.push(`🎯 Você ficou dentro da meta de guardar 20% da renda. Boa!`);
    }
  }

  return dicas;
}

/** Bloco de orçamentos: "Alimentação R$ 820 / R$ 800 ❌". */
function blocoOrcamentos(repo, porCategoria) {
  const orc = repo.orcamentos();
  if (orc.length === 0) return [];
  const totais = Object.fromEntries(porCategoria.map((c) => [c.categoria, c.total]));
  const linhas = ['', '*Orçamentos*'];
  for (const { categoria, limite } of orc) {
    const gasto = totais[categoria] ?? 0;
    const pct = (gasto / limite) * 100;
    const icone = pct > 100 ? '❌' : pct >= 80 ? '⚠️' : '✅';
    linhas.push(`${icone} ${categoria}: ${brl(gasto)} de ${brl(limite)} (${pct.toFixed(0)}%)`);
  }
  return linhas;
}

/**
 * Relatório de um mês.
 * - mês já fechado: relatório completo com comparação e dicas
 * - mês atual: parcial, com projeção até o fim do mês
 */
export function relatorioDoMes(repo, mes, hoje = hojeISO()) {
  const gastos = repo.gastosDoMes(mes);
  const anteriorGastos = repo.gastosDoMes(mesAnterior(mes));
  const total = somar(gastos);
  const totalAnterior = somar(anteriorGastos);
  const porCategoria = totaisPorCategoria(gastos);
  const porCategoriaAnterior = totaisPorCategoria(anteriorGastos);
  const anteriorMap = Object.fromEntries(porCategoriaAnterior.map((c) => [c.categoria, c.total]));
  const renda = Number(repo.config('renda')) || null;
  const emAndamento = mes === mesDe(hoje);

  const linhas = [];
  linhas.push(`🤖 📊 *${emAndamento ? 'Parcial de' : 'Relatório de'} ${nomeMes(mes)}*`);

  if (gastos.length === 0) {
    linhas.push('', 'Nenhum gasto registrado nesse mês.');
    return linhas.join('\n');
  }

  linhas.push('');
  linhas.push(`💸 *Total: ${brl(total)}* em ${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'}`);
  if (totalAnterior) {
    const pct = variacao(total, totalAnterior);
    const palavra = pct >= 0 ? 'a mais' : 'a menos';
    linhas.push(
      `${pct >= 0 ? '📈' : '📉'} ${brl(Math.abs(total - totalAnterior))} ${palavra} que ${nomeMes(mesAnterior(mes)).split(' ')[0]} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)${emAndamento ? ' até agora' : ''}`,
    );
  }

  const diasContados = emAndamento ? Number(hoje.slice(8, 10)) : diasNoMes(mes);
  const mediaDia = total / diasContados;
  linhas.push(`📅 Média de ${brl(mediaDia)} por dia`);

  if (emAndamento) {
    const projecao = mediaDia * diasNoMes(mes);
    linhas.push(`🔮 Nesse ritmo, o mês fecha em ~${brl(projecao)}`);
  }

  if (renda) {
    const pctRenda = (total / renda) * 100;
    const sobra = renda - total;
    linhas.push(
      `💼 ${pctRenda.toFixed(0)}% da renda (${brl(renda)}) · ${sobra >= 0 ? `sobra ${brl(sobra)}` : `faltou ${brl(-sobra)}`}`,
    );
  }

  linhas.push('', '*Por categoria*');
  for (const c of porCategoria) {
    const pct = (c.total / total) * 100;
    const comp = emAndamento ? '' : setinha(variacao(c.total, anteriorMap[c.categoria]));
    linhas.push(`${emoji(c.categoria)} ${c.categoria}: *${brl(c.total)}* · ${pct.toFixed(0)}%${comp}`);
    linhas.push(`${barra(pct)}`);
  }

  linhas.push(...blocoOrcamentos(repo, porCategoria));

  const maiores = [...gastos].sort((a, b) => b.valor - a.valor).slice(0, 5);
  linhas.push('', '*Maiores gastos*');
  for (const g of maiores) {
    linhas.push(`• ${diaMes(g.data)} ${g.descricao} — ${brl(g.valor)}`);
  }

  if (!emAndamento) {
    const dicas = dicasDeEconomia({ gastos, porCategoria, total, porCategoriaAnterior, renda });
    if (dicas.length) {
      linhas.push('', '*💡 Onde dá pra economizar*');
      for (const d of dicas) linhas.push(`• ${d}`);
    }
  }

  return linhas.join('\n');
}

/** Resumo curto de um período (hoje / semana). */
export function resumoPeriodo(repo, titulo, de, ate) {
  const gastos = repo.gastosDoPeriodo(de, ate);
  if (gastos.length === 0) return `🤖 ${titulo}: nenhum gasto registrado.`;
  const total = somar(gastos);
  const linhas = [`🤖 *${titulo}: ${brl(total)}* (${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'})`, ''];
  for (const c of totaisPorCategoria(gastos)) {
    linhas.push(`${emoji(c.categoria)} ${c.categoria}: ${brl(c.total)}`);
  }
  return linhas.join('\n');
}
