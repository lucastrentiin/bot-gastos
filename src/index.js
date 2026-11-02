import 'dotenv/config';
import cron from 'node-cron';
import { abrirBanco } from './db.js';
import { processarMensagem, processarComprovante } from './comandos.js';
import { relatorioDoMes } from './relatorio.js';
import { iniciarWhatsApp } from './whatsapp.js';
import { provedorIA } from './ia.js';
import { TZ, hojeISO, mesDe, mesAnterior, nomeMes } from './util.js';

const repo = abrirBanco();
let enviarParaMim = null; // atualizado a cada (re)conexão

/** Manda o relatório do mês passado, se ainda não mandou. */
async function enviarRelatorioMensalSePreciso() {
  if (!enviarParaMim) return;
  const mes = mesAnterior(mesDe(hojeISO()));
  if (repo.config('ultimo_relatorio') === mes) return;
  if (repo.gastosDoMes(mes).length === 0) {
    repo.gravarConfig('ultimo_relatorio', mes);
    return;
  }
  await enviarParaMim(relatorioDoMes(repo, mes));
  repo.gravarConfig('ultimo_relatorio', mes);
  console.log(`📊 Relatório de ${nomeMes(mes)} enviado.`);
}

// Dia 1º de cada mês, às 9h (horário de Brasília)
const HORARIO = process.env.RELATORIO_CRON || '0 9 1 * *';
cron.schedule(HORARIO, () => enviarRelatorioMensalSePreciso().catch(console.error), { timezone: TZ });

await iniciarWhatsApp({
  aoReceber: (texto) => processarMensagem(repo, texto),
  aoReceberArquivo: (arquivo) => processarComprovante(repo, arquivo),
  aoConectar: (enviar) => {
    enviarParaMim = enviar;
    // Se o bot estava desligado no dia 1º, manda o relatório atrasado assim que conectar
    // (só depois das 9h do dia 1º, para não adiantar o horário de sempre)
    const agora = new Date();
    const hora = Number(agora.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }));
    const dia = Number(hojeISO().slice(8, 10));
    if (dia > 1 || hora >= 9) {
      setTimeout(() => enviarRelatorioMensalSePreciso().catch(console.error), 10_000);
    }
  },
});

const ia = provedorIA();
console.log(
  `🤖 Bot de gastos rodando. IA: ${ia ?? 'desligada'}. Leitura de comprovantes: ${process.env.GEMINI_API_KEY ? 'ligada' : 'desligada (precisa de GEMINI_API_KEY)'}.`,
);
