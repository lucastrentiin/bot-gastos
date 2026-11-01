// Funções pequenas usadas no bot todo: dinheiro, texto e datas.

export const TZ = process.env.TZ_BOT || 'America/Sao_Paulo';

/** 1234.5 -> "R$ 1.234,50" */
export function brl(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Minúsculas, sem acento e sem espaços sobrando. */
export function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Data de hoje (no fuso do bot) como "AAAA-MM-DD". */
export function hojeISO(agora = new Date()) {
  // en-CA formata como AAAA-MM-DD
  return agora.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Soma (ou subtrai) dias de uma data "AAAA-MM-DD". */
export function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "AAAA-MM" do mês de uma data ISO. */
export function mesDe(iso) {
  return iso.slice(0, 7);
}

/** Mês anterior a "AAAA-MM". */
export function mesAnterior(mes) {
  let [a, m] = mes.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}

export const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "2026-10" -> "outubro de 2026" */
export function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${NOMES_MESES[m - 1]} de ${a}`;
}

/** Quantos dias tem o mês "AAAA-MM". */
export function diasNoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** "2026-10-05" -> "05/10" */
export function diaMes(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Barrinha de porcentagem em texto: ▓▓▓░░░░░░░ */
export function barra(pct, tamanho = 10) {
  const cheios = Math.max(0, Math.min(tamanho, Math.round((pct / 100) * tamanho)));
  return '▓'.repeat(cheios) + '░'.repeat(tamanho - cheios);
}
