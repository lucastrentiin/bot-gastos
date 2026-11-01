// Decide a categoria de um gasto, nesta ordem:
//   1. o que você já ensinou ao bot (correções com "mudar")
//   2. palavras-chave fixas (categorias.js)
//   3. IA (Claude), se houver chave de API — e o resultado é guardado para a próxima vez
//   4. "Outros"
import { categoriaPorPalavraChave } from './categorias.js';
import { chaveDescricao } from './parser.js';
import { categorizarComIA } from './ia.js';

function categoriaAprendida(repo, chave) {
  const exata = repo.aprendido(chave);
  if (exata) return exata;
  // "uber eats centro" deve usar o que foi aprendido para "uber eats"
  const candidatos = repo
    .todosAprendidos()
    .filter((a) => a.chave.length >= 3 && ` ${chave} `.includes(` ${a.chave} `))
    .sort((a, b) => b.chave.length - a.chave.length);
  return candidatos[0]?.categoria ?? null;
}

export async function classificar(repo, descricao, valor, { ia = categorizarComIA } = {}) {
  const chave = chaveDescricao(descricao);

  const aprendida = categoriaAprendida(repo, chave);
  if (aprendida) return { categoria: aprendida, origem: 'aprendido' };

  const porPalavra = categoriaPorPalavraChave(descricao);
  if (porPalavra) return { categoria: porPalavra, origem: 'palavra-chave' };

  const daIA = await ia(descricao, valor);
  if (daIA) {
    if (chave) repo.aprender(chave, daIA);
    return { categoria: daIA, origem: 'ia' };
  }

  return { categoria: 'Outros', origem: 'padrao' };
}
