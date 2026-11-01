// Reserva: só é chamada quando as palavras-chave e o que o bot aprendeu não resolvem.
import Anthropic from '@anthropic-ai/sdk';
import { NOMES_CATEGORIAS } from './categorias.js';

const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

let cliente = null;
function obterCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cliente ??= new Anthropic({ timeout: 30_000, maxRetries: 2 });
  return cliente;
}

export function iaDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Pergunta ao Claude em qual categoria o gasto se encaixa.
 * Retorna o nome da categoria, ou null se não deu (sem chave, erro, recusa...).
 */
export async function categorizarComIA(descricao, valor) {
  const c = obterCliente();
  if (!c) return null;

  try {
    const resposta = await c.beta.messages.create({
      model: MODELO,
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
      system:
        'Você classifica gastos pessoais de um brasileiro em categorias de orçamento. ' +
        'A descrição é curta e informal, pode ter gíria, nome de loja ou erro de digitação. ' +
        `Categorias possíveis: ${NOMES_CATEGORIAS.join(', ')}. ` +
        'Use "Outros" apenas quando nenhuma outra fizer sentido.',
      messages: [{ role: 'user', content: `Gasto: "${descricao}" — R$ ${valor.toFixed(2)}` }],
    });

    if (resposta.stop_reason === 'refusal') return null;
    const texto = resposta.content.find((b) => b.type === 'text')?.text;
    if (!texto) return null;
    const { categoria } = JSON.parse(texto);
    return NOMES_CATEGORIAS.includes(categoria) ? categoria : null;
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      console.error('[ia] ANTHROPIC_API_KEY inválida — categorizando sem IA.');
    } else if (erro instanceof Anthropic.RateLimitError) {
      console.error('[ia] limite de uso da API atingido, tentando de novo depois.');
    } else if (erro instanceof Anthropic.APIError) {
      console.error(`[ia] erro da API (${erro.status}): ${erro.message}`);
    } else {
      console.error('[ia] falha ao categorizar:', erro.message);
    }
    return null;
  }
}
