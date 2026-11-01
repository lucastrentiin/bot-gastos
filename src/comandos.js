// Recebe o texto que você mandou e devolve a resposta do bot.
// Não sabe nada de WhatsApp: dá pra testar tudo sem celular.
import { lerGastos, lerNumero, chaveDescricao } from './parser.js';
import { classificar } from './classificar.js';
import { NOMES_CATEGORIAS, acharCategoria, emoji } from './categorias.js';
import { relatorioDoMes, resumoPeriodo } from './relatorio.js';
import { brl, normalizar, hojeISO, mesDe, mesAnterior, somarDias, diaMes, NOMES_MESES } from './util.js';

export const AJUDA = `🤖 *Bot de gastos*

*Registrar gasto* (um por linha, se quiser vários)
• mercado 87,50
• uber 23
• ontem ifood 45,90
• 15/10 farmácia 32

*Ver*
• *resumo*: mês atual até agora
• *relatorio*: mês passado completo (ou "relatorio setembro")
• *hoje* / *semana*
• *ultimos*: últimos 10 lançamentos
• *buscar uber*: procura um gasto

*Corrigir*
• *desfazer*: apaga o último
• *apagar 12*: apaga o gasto #12
• *mudar 12 lazer*: troca a categoria (e o bot aprende)

*Planejar*
• *orcamento alimentacao 800*: limite mensal (avisa em 80% e 100%)
• *orcamento*: ver limites
• *renda 3500*: sua renda mensal, pra calcular quanto sobra
• *categorias*: lista as categorias

No dia 1º de cada mês eu mando o relatório do mês anterior.`;

function linhaGasto(g) {
  return `#${g.id} ${diaMes(g.data)} ${emoji(g.categoria)} ${g.descricao}: ${brl(g.valor)}`;
}

/** "setembro", "09", "9/2026", "2026-09" -> "2026-09" */
function lerMes(texto, hoje) {
  const t = normalizar(texto);
  const anoAtual = Number(hoje.slice(0, 4));
  const idx = NOMES_MESES.findIndex((m) => normalizar(m) === t.split(' ')[0] || normalizar(m).slice(0, 3) === t.split(' ')[0]);
  let mes;
  let ano;
  if (idx >= 0) {
    mes = idx + 1;
    const a = t.match(/\d{4}/);
    ano = a ? Number(a[0]) : anoAtual;
  } else {
    let m = t.match(/^(\d{4})-(\d{1,2})$/);
    if (m) { ano = Number(m[1]); mes = Number(m[2]); }
    else if ((m = t.match(/^(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      mes = Number(m[1]);
      ano = m[2] ? Number(m[2]) : anoAtual;
      if (ano < 100) ano += 2000;
    } else return null;
  }
  if (mes < 1 || mes > 12) return null;
  const resultado = `${ano}-${String(mes).padStart(2, '0')}`;
  // "relatorio dezembro" em janeiro = dezembro do ano passado
  if (idx >= 0 && !/\d{4}/.test(t) && resultado > mesDe(hoje)) return `${ano - 1}-${String(mes).padStart(2, '0')}`;
  return resultado;
}

/** Aviso quando um gasto faz a categoria passar de 80% ou 100% do orçamento. */
function avisoOrcamento(repo, gasto, hoje) {
  const limite = repo.orcamento(gasto.categoria);
  if (!limite) return null;
  const depois = repo.totalCategoriaMes(mesDe(gasto.data), gasto.categoria);
  const antes = depois - gasto.valor;
  if (depois > limite && antes <= limite) {
    return `🚨 Estourou o orçamento de *${gasto.categoria}*: ${brl(depois)} de ${brl(limite)}.`;
  }
  if (depois >= limite * 0.8 && antes < limite * 0.8) {
    return `⚠️ ${gasto.categoria} já está em ${((depois / limite) * 100).toFixed(0)}% do orçamento (${brl(depois)} de ${brl(limite)}). Restam ${brl(limite - depois)}.`;
  }
  if (depois > limite && mesDe(gasto.data) === mesDe(hoje)) {
    return `🚨 ${gasto.categoria} segue acima do orçamento: ${brl(depois)} de ${brl(limite)}.`;
  }
  return null;
}

async function registrarGastos(repo, texto, hoje, ia) {
  const { gastos, linhasRuins } = lerGastos(texto, hoje);
  if (gastos.length === 0) return null;

  const linhas = [];
  const avisos = [];
  let algumOutros = null;

  for (const g of gastos) {
    const { categoria, origem } = await classificar(repo, g.descricao, g.valor, { ia });
    const salvo = repo.inserirGasto({ ...g, categoria, origem });
    const quando = salvo.data === hoje ? '' : ` (${diaMes(salvo.data)})`;
    linhas.push(`${emoji(categoria)} ${salvo.descricao}: *${brl(salvo.valor)}* → ${categoria}${quando} · #${salvo.id}`);
    if (origem === 'padrao') algumOutros = salvo;
    const aviso = avisoOrcamento(repo, salvo, hoje);
    if (aviso) avisos.push(aviso);
  }

  const resposta = [`🤖 ✅ ${gastos.length === 1 ? 'Anotado' : `${gastos.length} gastos anotados`}`, ...linhas];
  if (linhasRuins.length) {
    resposta.push('', `Não entendi: ${linhasRuins.map((l) => `"${l}"`).join(', ')}`);
  }
  if (algumOutros) {
    resposta.push('', `Não reconheci a categoria de "${algumOutros.descricao}". Para corrigir: *mudar ${algumOutros.id} lazer* (ou outra categoria).`);
  }
  if (avisos.length) resposta.push('', ...avisos);

  const mes = mesDe(hoje);
  const totalMes = repo.gastosDoMes(mes).reduce((s, x) => s + x.valor, 0);
  resposta.push('', `Total do mês: ${brl(totalMes)}`);
  return resposta.join('\n');
}

/**
 * Processa uma mensagem. Retorna o texto da resposta.
 * @param repo  repositório do banco (db.js)
 * @param texto mensagem recebida
 */
export async function processarMensagem(repo, texto, { hoje = hojeISO(), ia } = {}) {
  const original = texto.trim();
  if (!original) return null;
  const t = normalizar(original);
  const [cmd, ...resto] = t.split(' ');
  const args = resto.join(' ');

  switch (cmd) {
    case 'ajuda': case 'menu': case 'comandos': case 'help': case 'oi': case 'ola': case '?':
      return AJUDA;

    case 'resumo': case 'mes': case 'parcial':
      if (!args) return relatorioDoMes(repo, mesDe(hoje), hoje);
      break;

    case 'relatorio': {
      if (!args) return relatorioDoMes(repo, mesAnterior(mesDe(hoje)), hoje);
      const mes = lerMes(args, hoje);
      if (!mes) return '🤖 Não entendi o mês. Exemplos: *relatorio setembro*, *relatorio 09/2026*.';
      return relatorioDoMes(repo, mes, hoje);
    }

    case 'hoje':
      if (!args) return resumoPeriodo(repo, 'Hoje', hoje, hoje);
      break;

    case 'semana':
      if (!args) return resumoPeriodo(repo, 'Últimos 7 dias', somarDias(hoje, -6), hoje);
      break;

    case 'ultimos': case 'lista': case 'extrato': {
      if (args && !/^\d+$/.test(args)) break;
      const n = Math.min(Number(args) || 10, 50);
      const lista = repo.ultimosGastos(n);
      if (lista.length === 0) return '🤖 Nenhum gasto registrado ainda. Manda algo como *mercado 50*.';
      return [`🤖 *Últimos ${lista.length}*`, ...lista.map(linhaGasto)].join('\n');
    }

    case 'buscar': case 'procurar': {
      if (!args) return '🤖 O que você quer buscar? Ex: *buscar uber*';
      const achados = repo.buscar(args);
      if (achados.length === 0) return `🤖 Nada encontrado com "${args}".`;
      const total = achados.reduce((s, g) => s + g.valor, 0);
      return [`🤖 *"${args}"*: ${achados.length} gastos, ${brl(total)}`, ...achados.map(linhaGasto)].join('\n');
    }

    case 'desfazer': case 'apagar': case 'excluir': case 'deletar': {
      let alvo;
      if (!args) alvo = repo.ultimoGasto();
      else if (/^#?\d+$/.test(args)) alvo = repo.gasto(Number(args.replace('#', '')));
      else break;
      if (!alvo) return '🤖 Não achei esse gasto.';
      repo.apagarGasto(alvo.id);
      return `🤖 🗑️ Apagado: ${linhaGasto(alvo)}`;
    }

    case 'mudar': case 'corrigir': case 'trocar': {
      const m = args.match(/^#?(\d+)\s+(?:para\s+|pra\s+)?(.+)$/);
      if (!m) return '🤖 Use assim: *mudar 12 lazer*';
      const g = repo.gasto(Number(m[1]));
      if (!g) return `🤖 Não achei o gasto #${m[1]}.`;
      const categoria = acharCategoria(m[2]);
      if (!categoria) return `🤖 Categoria "${m[2]}" não existe. Opções: ${NOMES_CATEGORIAS.join(', ')}.`;
      repo.mudarCategoria(g.id, categoria);
      const chave = chaveDescricao(g.descricao);
      if (chave) repo.aprender(chave, categoria);
      return `🤖 ✏️ #${g.id} ${g.descricao} agora é ${emoji(categoria)} *${categoria}*. Da próxima vez já coloco lá.`;
    }

    case 'categorias':
      if (!args) return ['🤖 *Categorias*', ...NOMES_CATEGORIAS.map((c) => `${emoji(c)} ${c}`)].join('\n');
      break;

    case 'orcamento': case 'limite': case 'meta': {
      if (!args) {
        const orc = repo.orcamentos();
        if (orc.length === 0) return '🤖 Nenhum orçamento definido. Ex: *orcamento alimentacao 800*';
        const mes = mesDe(hoje);
        return [
          '🤖 *Orçamentos deste mês*',
          ...orc.map(({ categoria, limite }) => {
            const gasto = repo.totalCategoriaMes(mes, categoria);
            const pct = (gasto / limite) * 100;
            return `${pct > 100 ? '❌' : pct >= 80 ? '⚠️' : '✅'} ${categoria}: ${brl(gasto)} de ${brl(limite)} (${pct.toFixed(0)}%)`;
          }),
        ].join('\n');
      }
      const m = args.match(/^(.+?)\s+(\S+)$/);
      if (!m) return '🤖 Use assim: *orcamento alimentacao 800*';
      const categoria = acharCategoria(m[1]);
      if (!categoria) return `🤖 Categoria "${m[1]}" não existe. Opções: ${NOMES_CATEGORIAS.join(', ')}.`;
      if (['0', 'remover', 'tirar', 'apagar'].includes(m[2])) {
        repo.removerOrcamento(categoria);
        return `🤖 Orçamento de ${categoria} removido.`;
      }
      const limite = lerNumero(m[2].replace(/^r\$/, ''));
      if (!(limite > 0)) return '🤖 Valor inválido. Ex: *orcamento alimentacao 800*';
      repo.definirOrcamento(categoria, limite);
      return `🤖 🎯 Orçamento de ${emoji(categoria)} *${categoria}*: ${brl(limite)} por mês. Aviso quando chegar em 80% e quando passar.`;
    }

    case 'renda': case 'salario': {
      if (!args) {
        const renda = repo.config('renda');
        return renda ? `🤖 Sua renda mensal: ${brl(Number(renda))}` : '🤖 Renda não definida. Ex: *renda 3500*';
      }
      const valor = lerNumero(args.replace(/^r\$\s*/, ''));
      if (!(valor > 0)) return '🤖 Valor inválido. Ex: *renda 3500*';
      repo.gravarConfig('renda', valor);
      return `🤖 💼 Renda mensal: ${brl(valor)}. Vou mostrar quanto sobra nos relatórios.`;
    }

    default:
      break;
  }

  const registrado = await registrarGastos(repo, original, hoje, ia);
  if (registrado) return registrado;

  return '🤖 Não entendi. Para anotar um gasto, manda *descrição e valor*, ex: *mercado 87,50*. Digite *ajuda* para ver tudo.';
}
