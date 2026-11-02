// Chamada ao Gemini, com insistência:
//  - modelo sobrecarregado (503/500) ou limite momentâneo (429): espera e tenta de novo
//  - se continuar, ou se o modelo não existir (404), passa para o próximo modelo da lista
//  - chave inválida / pedido inválido (400/401/403): para na hora
const MODELOS_RESERVA = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
const TENTATIVAS_POR_MODELO = 2;
let modeloQueFunciona = null;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const temporario = (status) => status === 429 || status >= 500;

export async function chamarGemini(corpo, { timeout = 60_000 } = {}) {
  const pausaMs = Number(process.env.GEMINI_ESPERA_MS ?? 2000);
  const modelos = [...new Set([modeloQueFunciona, process.env.GEMINI_MODEL, ...MODELOS_RESERVA].filter(Boolean))];
  let ultimoErro;

  for (const modelo of modelos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
    for (let tentativa = 1; tentativa <= TENTATIVAS_POR_MODELO; tentativa++) {
      let resposta;
      try {
        resposta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          signal: AbortSignal.timeout(timeout),
          body: JSON.stringify(corpo),
        });
      } catch (erroRede) {
        // sem internet / demorou demais: tenta de novo
        ultimoErro = erroRede;
        console.warn(`[gemini] ${modelo}: ${erroRede.name === 'TimeoutError' ? 'demorou demais' : erroRede.message}`);
        if (tentativa < TENTATIVAS_POR_MODELO) await esperar(pausaMs * tentativa);
        continue;
      }

      if (resposta.ok) {
        if (modeloQueFunciona !== modelo) {
          modeloQueFunciona = modelo;
          console.log(`[gemini] usando o modelo ${modelo}`);
        }
        const json = await resposta.json();
        return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null;
      }

      const texto = await resposta.text();
      const erro = new Error(`Gemini respondeu ${resposta.status} (${modelo}): ${texto.slice(0, 500)}`);
      erro.status = resposta.status;
      erro.corpo = texto;
      ultimoErro = erro;

      if (resposta.status === 404) break; // modelo não existe: próximo
      if (!temporario(resposta.status)) throw erro; // chave/pedido inválido: não adianta insistir
      console.warn(`[gemini] ${modelo} ocupado (${resposta.status}), tentativa ${tentativa}/${TENTATIVAS_POR_MODELO}`);
      if (tentativa < TENTATIVAS_POR_MODELO) await esperar(pausaMs * tentativa);
    }
    if (modeloQueFunciona === modelo) modeloQueFunciona = null; // falhou agora: na próxima começa pela lista
  }
  throw ultimoErro ?? new Error('nenhum modelo do Gemini disponível');
}

/** Explica o erro do Gemini em português, para mostrar no WhatsApp (sem dados sensíveis). */
export function motivoDoErro(erro) {
  const corpo = String(erro?.corpo || erro?.message || '');
  if (/API_KEY_INVALID|API key not valid/i.test(corpo)) return 'a chave do Gemini é inválida. Confira com *bot-gastos config* no servidor.';
  if (erro?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(corpo)) return 'o limite grátis do Gemini acabou por agora. Tenta de novo em alguns minutos.';
  if (erro?.status === 403 || /PERMISSION_DENIED/i.test(corpo)) return 'a chave do Gemini não tem permissão (a API pode não estar ativada nesse projeto do Google).';
  if (/não encontrado|nenhum modelo/i.test(corpo)) return 'nenhum modelo do Gemini disponível para essa chave.';
  if (/location is not supported|FAILED_PRECONDITION/i.test(corpo)) return 'o Gemini não está liberado para essa conta/região.';
  if (erro?.name === 'TimeoutError' || /timeout|aborted/i.test(corpo)) return 'o Gemini demorou demais para responder.';
  if (erro?.status >= 500) return 'o Gemini está sobrecarregado agora (tentei vários modelos). Tenta de novo em alguns minutos.';
  if (erro instanceof SyntaxError) return 'o Gemini respondeu num formato que não entendi.';
  const curto = corpo.match(/"message":\s*"([^"]{1,160})/)?.[1] || corpo.slice(0, 160);
  return `erro do Gemini: ${curto}`;
}
