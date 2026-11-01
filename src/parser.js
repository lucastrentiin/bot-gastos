// Transforma "mercado 87,50" em { valor: 87.5, descricao: 'mercado', data: '2026-11-01' }.
import { hojeISO, somarDias, normalizar } from './util.js';

// Um número de dinheiro: 87 | 87,50 | 87.50 | 1.200 | 1.200,00 | 1200,5 | R$ 30 | 30 reais | 30k? (não)
const RE_VALOR = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|real|conto|contos|pila|pilas))?/gi;

/** Converte o texto do número para Number, entendendo o formato brasileiro. */
export function lerNumero(txt) {
  let t = txt.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
    // 1.200 ou 1.200,50 -> ponto é milhar
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Lê a data no começo ou no fim da mensagem: "ontem", "anteontem", "dia 15", "15/10".
 * Retorna { data, resto }.
 */
function extrairData(texto, hoje) {
  const padroes = [
    { re: /\banteontem\b/i, fn: () => somarDias(hoje, -2) },
    { re: /\bontem\b/i, fn: () => somarDias(hoje, -1) },
    { re: /\bhoje\b/i, fn: () => hoje },
    {
      // 15/10 ou 15/10/2026
      re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
      fn: (m) => {
        let ano = m[3] ? Number(m[3]) : Number(hoje.slice(0, 4));
        if (ano < 100) ano += 2000;
        const iso = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        // Se a data cair no futuro e o ano não foi dito, é do ano passado (ex.: "28/12" em janeiro)
        if (!m[3] && iso > hoje) return `${ano - 1}${iso.slice(4)}`;
        return iso;
      },
    },
    {
      // "dia 15" -> dia 15 deste mês (ou do mês passado, se ainda não chegou)
      re: /\bdia (\d{1,2})\b/i,
      fn: (m) => {
        const dia = m[1].padStart(2, '0');
        let iso = `${hoje.slice(0, 8)}${dia}`;
        if (iso > hoje) {
          const d = new Date(`${hoje.slice(0, 8)}01T12:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() - 1);
          iso = `${d.toISOString().slice(0, 8)}${dia}`;
        }
        return iso;
      },
    },
  ];
  for (const { re, fn } of padroes) {
    const m = texto.match(re);
    if (m) {
      const data = fn(m);
      if (!Number.isNaN(new Date(`${data}T12:00:00Z`).getTime())) {
        return { data, resto: texto.replace(m[0], ' ') };
      }
    }
  }
  return { data: hoje, resto: texto };
}

/**
 * Lê UMA linha de gasto. Retorna null se a linha não tem valor ou descrição.
 * Exemplos: "mercado 87,50", "87.50 mercado", "R$ 1.200 aluguel", "ontem uber 23"
 */
export function lerLinha(linha, hoje = hojeISO()) {
  const { data, resto } = extrairData(linha, hoje);

  const candidatos = [...resto.matchAll(RE_VALOR)].map((m) => ({
    bruto: m[0],
    numero: m[1],
    temMoeda: /r\$|reais|real|conto|pila/i.test(m[0]),
    temCentavos: /[.,]\d{1,2}$/.test(m[1]),
    indice: m.index,
  }));
  if (candidatos.length === 0) return null;

  // Preferência: número com "R$"/"reais" > número com centavos > o último número
  const escolhido =
    candidatos.find((c) => c.temMoeda) ||
    candidatos.find((c) => c.temCentavos) ||
    candidatos[candidatos.length - 1];

  const valor = lerNumero(escolhido.numero);
  if (!(valor > 0) || valor > 10_000_000) return null;

  const descricao = (resto.slice(0, escolhido.indice) + ' ' + resto.slice(escolhido.indice + escolhido.bruto.length))
    .replace(/[-–—:;=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // tira "gastei/paguei/comprei" e preposições soltas nas pontas ("gastei 30 no mercado" -> "mercado")
    .replace(/^(?:(?:gastei|paguei|comprei|foi|deu)\s+)+/i, '')
    .replace(/^(?:(?:de|do|da|no|na|em|com|um|uma|o|a)\s+)+/i, '')
    .replace(/(?:\s+(?:de|do|da|no|na|em|com))+$/i, '')
    .trim();

  if (!descricao || !/[a-zà-ú]/i.test(descricao)) return null;

  return { valor: Math.round(valor * 100) / 100, descricao, data };
}

/** Uma mensagem pode ter vários gastos, um por linha. */
export function lerGastos(texto, hoje = hojeISO()) {
  const gastos = [];
  const linhasRuins = [];
  for (const linha of texto.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const g = lerLinha(linha, hoje);
    if (g) gastos.push(g);
    else linhasRuins.push(linha);
  }
  return { gastos, linhasRuins };
}

/** Normaliza a descrição para servir de "chave" do que o bot aprendeu. */
// Palavras que não mudam o sentido: "pix pro joão" = "pix para o joão" = "pix joão"
const PALAVRAS_VAZIAS = new Set(['pro', 'pra', 'para', 'p', 'o', 'a', 'os', 'as', 'do', 'da', 'dos', 'das', 'de', 'no', 'na', 'ao', 'com', 'em']);

export function chaveDescricao(descricao) {
  return normalizar(descricao)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .join(' ');
}
