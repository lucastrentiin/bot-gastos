// Reserva: só é chamada quando as palavras-chave e o que o bot aprendeu não resolvem.
// Funciona com Gemini (GEMINI_API_KEY) ou Claude (ANTHROPIC_API_KEY). Se as duas estiverem
// configuradas, usa o Gemini. Sem nenhuma, o bot funciona só com palavras-chave.
import Anthropic from '@anthropic-ai/sdk';
import { NOMES_CATEGORIAS } from './categorias.js';

const INSTRUCOES =
  'Você classifica gastos pessoais de um brasileiro em categorias de orçamento. ' +
  'A descrição é curta e informal, pode ter gíria, nome de loja ou erro de digitação. ' +
  `Categorias possíveis: ${NOMES_CATEGORIAS.join(', ')}. ` +
  'Use "Outros" apenas quando nenhuma outra fizer sentido.';

export function provedorIA() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}

export function iaDisponivel() {
  return provedorIA() !== null;
}

function validar(texto) {
  if (!texto) return null;
  const { categoria } = JSON.parse(texto);
  return NOMES_CATEGORIAS.includes(categoria) ? categoria : null;
}

// ---------- Gemini ----------
async function comGemini(descricao, valor) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCOES }] },
      contents: [{ role: 'user', parts: [{ text: `Gasto: "${descricao}" — R$ ${valor.toFixed(2)}` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { categoria: { type: 'STRING', enum: NOMES_CATEGORIAS } },
          required: ['categoria'],
        },
      },
    }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    if (resposta.status === 400 || resposta.status === 403) {
      throw new Error(`Gemini recusou a chave/pedido (${resposta.status}): ${corpo.slice(0, 200)}`);
    }
    throw new Error(`Gemini respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
  const json = await resposta.json();
  const texto = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  return validar(texto);
}

// ---------- Claude ----------
let clienteClaude = null;
async function comClaude(descricao, valor) {
  clienteClaude ??= new Anthropic({ timeout: 30_000, maxRetries: 2 });
  const resposta = await clienteClaude.beta.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
    max_tokens: 2000,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { categoria: { type: 'string', enum: NOMES_CATEGORIAS } },
          required: ['categoria'],
          additionalProperties: false,
        },
      },
    },
    // Se o modelo recusar por engano, a API tenta de novo em outro modelo sozinha.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: INSTRUCOES,
    messages: [{ role: 'user', content: `Gasto: "${descricao}" — R$ ${valor.toFixed(2)}` }],
  });
  if (resposta.stop_reason === 'refusal') return null;
  return validar(resposta.content.find((b) => b.type === 'text')?.text);
}

/**
 * Pergunta à IA em qual categoria o gasto se encaixa.
 * Retorna o nome da categoria, ou null se não deu (sem chave, erro, recusa...).
 */
export async function categorizarComIA(descricao, valor) {
  const provedor = provedorIA();
  if (!provedor) return null;
  try {
    return provedor === 'gemini' ? await comGemini(descricao, valor) : await comClaude(descricao, valor);
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      console.error('[ia] ANTHROPIC_API_KEY inválida — categorizando sem IA.');
    } else if (erro instanceof Anthropic.APIError) {
      console.error(`[ia] erro da API Claude (${erro.status}): ${erro.message}`);
    } else {
      console.error(`[ia] falha ao categorizar com ${provedor}:`, erro.message);
    }
    return null;
  }
}
