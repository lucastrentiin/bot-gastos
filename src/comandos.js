// Recebe o texto que você mandou e devolve a resposta do bot.
// Não sabe nada de WhatsApp: dá pra testar tudo sem celular.
import { lerGastos, lerNumero, chaveDescricao } from './parser.js';
import { classificar } from './classificar.js';
import { NOMES_CATEGORIAS, acharCategoria, emoji } from './categorias.js';
import { relatorioDoMes, resumoPeriodo } from './relatorio.js';
import { lerComprovanteGemini } from './comprovante.js';
import { motivoDoErro } from './gemini.js';
import { brl, normalizar, hojeISO, mesDe, mesAnterior, somarDias, diaMes, NOMES_MESES } from './util.js';

export const AJUDA = `🤖 *Bot de gastos*

*Registrar gasto*
• 📸 manda o *print ou PDF do comprovante* (Pix, cartão, nota)
  ou *print das notificações/extrato do banco* (vários gastos de uma vez)
  com legenda opcional, ex: "bolo"
• ou escreve: mercado 87,50 (um por linha, se quiser vários)
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
      // comprovante com legenda: "bolo (Maria Souza)" -> aprende também "Maria Souza"
      const recebedor = g.descricao.match(/\(([^()]+)\)$/)?.[1];
      if (recebedor) {
        const chaveRecebedor = chaveDescricao(recebedor);
        if (chaveRecebedor) repo.aprender(chaveRecebedor, categoria);
      }
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

/** Limpa o nome do recebedor: "SUPERMERCADO BOM PRECO LTDA" -> "Supermercado Bom Preco" */
function limparRecebedor(nome) {
  return String(nome || '')
    .replace(/\b(ltda|me|epp|eireli|s\.?a\.?|cnpj|cpf)\b\.?/gi, ' ')
    .replace(/[\d.\-/*]{6,}/g, ' ') // pedaços de CPF/CNPJ
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

/** Aceita o formato novo ({ transacoes: [...] }) e o antigo (um comprovante só). */
function listaDeTransacoes(lido) {
  if (Array.isArray(lido?.transacoes)) return lido.transacoes;
  if (lido?.eh_comprovante) return [lido];
  return [];
}

/**
 * Registra os gastos de um print/PDF: comprovante único ou print de notificações/extrato
 * com várias compras. O que já estava anotado (prints que se sobrepõem) não é duplicado.
 * @param arquivo { buffer, mime, legenda }
 */
export async function processarComprovante(repo, { buffer, mime, legenda = '' }, { hoje = hojeISO(), ler = lerComprovanteGemini, ia } = {}) {
  if (!process.env.GEMINI_API_KEY && ler === lerComprovanteGemini) {
    return '🤖 Para ler comprovantes eu preciso da chave do Gemini. No servidor rode *bot-gastos config* e preencha GEMINI_API_KEY (grátis em aistudio.google.com/apikey).';
  }

  let lido;
  try {
    lido = await ler(buffer, mime, legenda.trim(), hoje);
  } catch (erro) {
    console.error('[comprovante] erro ao ler:', erro.message);
    return `🤖 ⚠️ Não consegui ler esse comprovante: ${motivoDoErro(erro)}\n\nEnquanto isso, dá pra escrever o gasto: *mercado 87,50*`;
  }

  // limpa e valida cada transação
  const itens = listaDeTransacoes(lido)
    .map((t) => {
      const valor = Math.round(Number(t?.valor) * 100) / 100;
      const recebedor = limparRecebedor(t?.recebedor) || 'Comprovante';
      let data = hoje;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t?.data || '') && t.data <= hoje && t.data >= somarDias(hoje, -400)) data = t.data;
      const hora = /^\d{2}:\d{2}$/.test(t?.hora || '') ? t.hora : null;
      const categoriaIA = NOMES_CATEGORIAS.includes(t?.categoria) ? t.categoria : null;
      return { valor, recebedor, data, hora, categoriaIA };
    })
    .filter((t) => t.valor > 0);

  if (itens.length === 0) {
    return '🤖 Não achei nenhum pagamento nesse arquivo. Se for um gasto, escreve: *descrição valor*, ex: *mercado 87,50*';
  }

  // Quantos de cada já estão no banco? (foto antes de inserir, para não contar os desta mesma imagem)
  const chaveDe = (t) => `${t.data}|${t.hora ?? ''}|${t.valor}|${normalizar(t.recebedor)}`;
  const jaNoBanco = new Map();
  for (const t of itens) {
    const k = chaveDe(t);
    if (jaNoBanco.has(k)) continue;
    const quantos = repo
      .gastosDoPeriodo(t.data, t.data)
      .filter(
        (g) =>
          g.valor === t.valor &&
          normalizar(g.descricao).includes(normalizar(t.recebedor)) &&
          (!t.hora || !g.hora || g.hora === t.hora),
      ).length;
    jaNoBanco.set(k, quantos);
  }

  const legendaLimpa = itens.length === 1 ? legenda.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  const salvos = [];
  const pulados = [];
  for (const t of itens) {
    const k = chaveDe(t);
    if (jaNoBanco.get(k) > 0) {
      // este já estava anotado (veio de outro print ou foi mandado de novo)
      jaNoBanco.set(k, jaNoBanco.get(k) - 1);
      pulados.push(t);
      continue;
    }
    const descricao = legendaLimpa ? `${legendaLimpa} (${t.recebedor})` : t.recebedor;
    // categoria: o que você ensinou > palavras-chave > o que a IA viu no print
    const { categoria, origem } = await classificar(repo, descricao, t.valor, { ia: ia ?? (async () => t.categoriaIA) });
    const salvo = repo.inserirGasto({ data: t.data, hora: t.hora, valor: t.valor, descricao, categoria, origem });
    salvos.push(salvo);
    // legenda resolveu a categoria? ensina o recebedor para o próximo Pix sem legenda
    if (legendaLimpa && categoria !== 'Outros' && t.recebedor !== 'Comprovante') {
      const chaveRecebedor = chaveDescricao(t.recebedor);
      if (chaveRecebedor) repo.aprender(chaveRecebedor, categoria);
    }
  }

  const linha = (g) => `${emoji(g.categoria)} ${g.descricao}: *${brl(g.valor)}* → ${g.categoria}${g.data === hoje ? '' : ` (${diaMes(g.data)})`} · #${g.id}`;
  const resposta = [];
  if (salvos.length === 0) {
    resposta.push(`🤖 Nada novo nesse ${itens.length === 1 ? 'comprovante' : 'print'}: ${itens.length === 1 ? 'esse gasto já estava anotado' : `os ${itens.length} gastos já estavam anotados`}.`);
    resposta.push('Se era outra compra igual, escreve ela: *descrição valor*.');
    return resposta.join('\n');
  }
  resposta.push(salvos.length === 1 && itens.length === 1 ? '🤖 ✅ Comprovante anotado' : `🤖 ✅ ${salvos.length} ${salvos.length === 1 ? 'gasto anotado' : 'gastos anotados'} do print`);
  resposta.push(...salvos.map(linha));

  if (pulados.length) {
    resposta.push('', `↩️ ${pulados.length} já ${pulados.length === 1 ? 'estava anotado' : 'estavam anotados'} (apareceu em outro print), não dupliquei.`);
  }
  const semCategoria = salvos.filter((g) => g.origem === 'padrao');
  if (semCategoria.length) {
    const lista = semCategoria.map((g) => `#${g.id} ${g.descricao}`).join(', ');
    resposta.push(
      '',
      `Não sei a categoria de: ${lista}. Corrige com *mudar ${semCategoria[0].id} lazer* (ou outra) que da próxima vez eu acerto.`,
    );
  }
  const avisos = [...new Set(salvos.map((g) => avisoOrcamento(repo, g, hoje)).filter(Boolean))];
  if (avisos.length) resposta.push('', ...avisos);
  const totalMes = repo.gastosDoMes(mesDe(hoje)).reduce((t, x) => t + x.valor, 0);
  resposta.push('', `Total do mês: ${brl(totalMes)}`);
  return resposta.join('\n');
}
