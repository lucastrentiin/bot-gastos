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
      throw new Error(`Gemini respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
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
