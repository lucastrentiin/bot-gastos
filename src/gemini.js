// Chamada ao Gemini. Se o modelo não existir na conta (404), tenta o próximo da lista.
const MODELOS_RESERVA = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
let modeloQueFunciona = null;

export async function chamarGemini(corpo, { timeout = 60_000 } = {}) {
  const preferido = process.env.GEMINI_MODEL;
  const modelos = [...new Set([modeloQueFunciona, preferido, ...MODELOS_RESERVA].filter(Boolean))];
  let ultimoErro;
  for (const modelo of modelos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(timeout),
      body: JSON.stringify(corpo),
    });
    if (resposta.status === 404) {
      ultimoErro = new Error(`modelo ${modelo} não encontrado`);
      continue;
    }
    if (!resposta.ok) {
      const corpo = await resposta.text();
      const erro = new Error(`Gemini respondeu ${resposta.status} (${modelo}): ${corpo.slice(0, 500)}`);
      erro.status = resposta.status;
      erro.corpo = corpo;
      throw erro;
    }
    if (modeloQueFunciona !== modelo) {
      modeloQueFunciona = modelo;
      console.log(`[gemini] usando o modelo ${modelo}`);
    }
    const json = await resposta.json();
    return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null;
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
  if (erro?.status >= 500) return 'o Gemini está fora do ar agora.';
  if (erro instanceof SyntaxError) return 'o Gemini respondeu num formato que não entendi.';
  const curto = corpo.match(/"message":\s*"([^"]{1,160})/)?.[1] || corpo.slice(0, 160);
  return `erro do Gemini: ${curto}`;
}
