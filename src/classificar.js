// Decide a categoria de um gasto, nesta ordem:
//   1. o que você já ensinou ao bot para ESSA descrição exata ("pix joão")
//   2. palavras-chave fixas ("pix joão bolo" -> bolo -> Alimentação)
//   3. o que você ensinou para parte da descrição ("pix joão sábado" -> "pix joão")
//   4. IA (Gemini/Claude), se houver chave, e o resultado é guardado para a próxima vez
//   5. "Outros", e o bot pede para você corrigir
import { categoriaPorPalavraChave } from './categorias.js';
import { chaveDescricao } from './parser.js';
import { categorizarComIA } from './ia.js';

function aprendidoParcial(repo, chave) {
  const candidatos = repo
    .todosAprendidos()
    .filter((a) => a.chave.length >= 3 && a.chave !== chave && ` ${chave} `.includes(` ${a.chave} `))
    .sort((a, b) => b.chave.length - a.chave.length);
  return candidatos[0]?.categoria ?? null;
}

export async function classificar(repo, descricao, valor, { ia = categorizarComIA } = {}) {
  const chave = chaveDescricao(descricao);

  const exata = chave ? repo.aprendido(chave) : null;
  if (exata) return { categoria: exata, origem: 'aprendido' };

  const porPalavra = categoriaPorPalavraChave(descricao);
  if (porPalavra) return { categoria: porPalavra, origem: 'palavra-chave' };

  const parcial = aprendidoParcial(repo, chave);
  if (parcial) return { categoria: parcial, origem: 'aprendido' };

  const daIA = await ia(descricao, valor);
  // "Outros" da IA = ela também não sabe: não guarda, e o bot pede pra você corrigir
  if (daIA && daIA !== 'Outros') {
    if (chave) repo.aprender(chave, daIA);
    return { categoria: daIA, origem: 'ia' };
  }

  return { categoria: 'Outros', origem: 'padrao' };
}
