// Chamada ao Gemini, com insistência:
//  - descobre na API quais modelos "flash" a sua chave tem (os nomes mudam com o tempo)
//  - modelo sobrecarregado (503/500) ou limite momentâneo (429): espera e tenta de novo
//  - se continuar, ou se o modelo não existir/foi desativado: passa para o próximo
//  - chave inválida / pedido inválido: para na hora
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELOS_RESERVA = ['gemini-flash-latest', 'gemini-2.5-flash'];
const TENTATIVAS_POR_MODELO = 2;
let modeloQueFunciona = null;
let descobertos = null; // { quando, modelos }

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const temporario = (status) => status === 429 || status >= 500;
const modeloSumiu = (status, texto) =>
  status === 404 || status === 410 || /no longer available|not found|deprecated|not supported for generateContent|is not supported/i.test(texto);

/** Ordena do melhor para o pior: versão mais nova, estável antes de preview, flash antes de lite. */
export function ordenarModelos(nomes) {
  const nota = (n) => {
    const versao = Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    return versao * 100 - (/preview|exp/.test(n) ? 50 : 0) - (/lite/.test(n) ? 5 : 0);
  };
  return [...nomes].sort((a, b) => nota(b) - nota(a));
}

/** Pergunta à API quais modelos flash essa chave pode usar (guarda por 6 h). */
async function modelosDaConta() {
  if (process.env.GEMINI_DESCOBRIR === '0') return [];
  if (descobertos && Date.now() - descobertos.quando < 6 * 3600_000) return descobertos.modelos;
  try {
    const r = await fetch(`${BASE}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`listar modelos: ${r.status}`);
    const { models = [] } = await r.json();
    const nomes = models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embed|thinking|computer|robotics/.test(n));
    const modelos = ordenarModelos(nomes).slice(0, 5);
    descobertos = { quando: Date.now(), modelos };
    if (modelos.length) console.log(`[gemini] modelos disponíveis: ${modelos.join(', ')}`);
    return modelos;
  } catch (e) {
    console.warn('[gemini] não consegui listar os modelos:', e.message);
    return [];
  }
}

export async function chamarGemini(corpo, { timeout = 60_000 } = {}) {
  const pausaMs = Number(process.env.GEMINI_ESPERA_MS ?? 2000);
  const fila = [modeloQueFunciona, process.env.GEMINI_MODEL, ...(await modelosDaConta()), ...MODELOS_RESERVA].filter(Boolean);
  const tentados = new Set();
  let ultimoErro;

  while (fila.length) {
    const modelo = fila.shift();
    if (tentados.has(modelo)) continue;
    tentados.add(modelo);
    const url = `${BASE}/models/${modelo}:generateContent`;

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

      if (modeloSumiu(resposta.status, texto)) {
        console.warn(`[gemini] ${modelo} não está disponível, tentando outro`);
        // o próprio erro às vezes sugere o modelo novo: "use models/gemini-X-flash"
        const sugerido = texto.match(/use models\/([\w.-]+)/)?.[1];
        if (sugerido) fila.unshift(sugerido);
        break;
      }
      if (!temporario(resposta.status)) throw erro; // chave/pedido inválido
      console.warn(`[gemini] ${modelo} ocupado (${resposta.status}), tentativa ${tentativa}/${TENTATIVAS_POR_MODELO}`);
      if (tentativa < TENTATIVAS_POR_MODELO) await esperar(pausaMs * tentativa);
    }
    if (modeloQueFunciona === modelo) modeloQueFunciona = null;
  }
  throw ultimoErro ?? new Error('nenhum modelo do Gemini disponível');
}

/** Só para testes: esquece o que já descobriu. */
export function _reiniciarGemini() {
  modeloQueFunciona = null;
  descobertos = null;
}

/** Explica o erro do Gemini em português, para mostrar no WhatsApp (sem dados sensíveis). */
export function motivoDoErro(erro) {
  const corpo = String(erro?.corpo || erro?.message || '');
  if (/API_KEY_INVALID|API key not valid/i.test(corpo)) return 'a chave do Gemini é inválida. Confira com *bot-gastos config* no servidor.';
  if (erro?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(corpo)) return 'o limite grátis do Gemini acabou por agora. Tenta de novo em alguns minutos.';
  if (erro?.status === 403 || /PERMISSION_DENIED/i.test(corpo)) return 'a chave do Gemini não tem permissão (a API pode não estar ativada nesse projeto do Google).';
  if (/no longer available|not found|nenhum modelo/i.test(corpo)) return 'nenhum modelo do Gemini disponível para essa chave (tentei todos que a conta tem).';
  if (/location is not supported|FAILED_PRECONDITION/i.test(corpo)) return 'o Gemini não está liberado para essa conta/região.';
  if (erro?.name === 'TimeoutError' || /timeout|aborted/i.test(corpo)) return 'o Gemini demorou demais para responder.';
  if (erro?.status >= 500) return 'o Gemini está sobrecarregado agora (tentei vários modelos). Tenta de novo em alguns minutos.';
  if (erro instanceof SyntaxError) return 'o Gemini respondeu num formato que não entendi.';
  const curto = corpo.match(/"message":\s*"([^"]{1,160})/)?.[1] || corpo.slice(0, 160);
  return `erro do Gemini: ${curto}`;
}
