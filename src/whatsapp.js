// Conexão com o WhatsApp como "aparelho conectado" da SUA conta (igual WhatsApp Web).
// O bot só lê e responde a conversa "Você" (mensagens para si mesmo).
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  Browsers,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'node:fs';

const PASTA_SESSAO = process.env.SESSAO_PATH || './dados/sessao-whatsapp';

/** Pega o texto de uma mensagem, seja ela simples, respondida, temporária etc. */
export function textoDaMensagem(message) {
  if (!message) return null;
  const m = message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message;
  return m.conversation ?? m.extendedTextMessage?.text ?? null;
}

/** true se a mensagem foi escrita por você na conversa com você mesmo. */
export function ehConversaComigo(key, user) {
  if (!key?.fromMe || !user) return false;
  const meus = new Set([user.id, user.lid].filter(Boolean).map(jidNormalizedUser));
  return [key.remoteJid, key.remoteJidAlt].filter(Boolean).some((j) => meus.has(jidNormalizedUser(j)));
}

/**
 * Inicia a conexão.
 * @param aoReceber async (texto) => resposta | null
 * @param aoConectar (enviar) => void — chamado a cada conexão; enviar(texto) manda para você mesmo
 */
export async function iniciarWhatsApp({ aoReceber, aoConectar }) {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  const logger = pino({ level: process.env.LOG_BAILEYS || 'warn' });

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    // sem internet para checar a versão: usa a padrão da biblioteca
  }

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    // Precisa ser um navegador "de verdade": nome inventado faz o WhatsApp recusar o código
    browser: Browsers.macOS('Chrome'),
    qrTimeout: 60_000, // cada código/QR vale 1 min (o padrão é 20 s)
    markOnlineOnConnect: false, // não aparece "online" pra ninguém por causa do bot
    syncFullHistory: false,
  });

  // IDs das mensagens que o próprio bot mandou, para não responder a si mesmo em loop
  const enviadasPeloBot = new Set();

  async function enviar(jid, texto) {
    const r = await sock.sendMessage(jid, { text: texto });
    if (r?.key?.id) {
      enviadasPeloBot.add(r.key.id);
      if (enviadasPeloBot.size > 500) enviadasPeloBot.delete(enviadasPeloBot.values().next().value);
    }
    return r;
  }

  sock.ev.on('creds.update', saveCreds);

  let codigoPedido = false;
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const numero = process.env.WHATSAPP_NUMERO?.replace(/\D/g, '');
      if (numero && !codigoPedido) {
        // Alternativa ao QR: código de 8 letras para digitar no celular
        codigoPedido = true;
        try {
          const codigo = await sock.requestPairingCode(numero);
          const bonito = codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo;
          console.log(
            `\n📱 No celular: WhatsApp > Aparelhos conectados > Conectar aparelho > "Conectar com número de telefone"\n` +
              `   Número usado: +${numero}\n` +
              `   CÓDIGO: ${bonito}   (vale alguns minutos; se aparecer um código novo aqui, use o novo)\n`,
          );
        } catch (e) {
          console.error('Não consegui gerar o código de pareamento:', e.message);
        }
      } else if (!numero) {
        console.log('\n📱 Escaneie com o celular: WhatsApp > Aparelhos conectados > Conectar aparelho\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      const eu = jidNormalizedUser(sock.user.id);
      console.log(`✅ Conectado como ${eu}. Mande mensagens na conversa "Você" (você mesmo).`);
      aoConectar?.((texto) => enviar(eu, texto));
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        // Desconectado pelo celular (ou login pela metade): apaga a sessão e gera um código/QR novo
        console.error('❌ O WhatsApp desconectou este aparelho. Gerando um novo código/QR para conectar de novo...');
        fs.rmSync(PASTA_SESSAO, { recursive: true, force: true });
        setTimeout(() => iniciarWhatsApp({ aoReceber, aoConectar }).catch(console.error), 5000);
        return;
      }
      console.log(`Conexão caiu (${status ?? 'sem código'}). Reconectando em 5s...`);
      setTimeout(() => iniciarWhatsApp({ aoReceber, aoConectar }).catch(console.error), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // ignora histórico antigo que chega ao conectar
    for (const msg of messages) {
      try {
        if (enviadasPeloBot.has(msg.key.id)) continue;
        if (!ehConversaComigo(msg.key, sock.user)) continue;
        const texto = textoDaMensagem(msg.message);
        if (!texto || texto.startsWith('🤖')) continue; // respostas do bot começam com 🤖

        const resposta = await aoReceber(texto);
        if (resposta) await enviar(msg.key.remoteJid, resposta);
      } catch (erro) {
        console.error('Erro ao processar mensagem:', erro);
        try {
          await enviar(msg.key.remoteJid, '🤖 ⚠️ Deu um erro aqui ao processar isso. Tenta de novo?');
        } catch {}
      }
    }
  });

  return sock;
}
