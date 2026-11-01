// Categorias e palavras-chave. Edite à vontade: é só acrescentar palavras nas listas.
import { normalizar } from './util.js';

export const CATEGORIAS = {
  'Alimentação': {
    emoji: '🍔',
    palavras: [
      'ifood', 'i food', 'rappi', 'lanche', 'lanchonete', 'restaurante', 'almoco', 'janta', 'jantar',
      'cafe', 'padaria', 'pizza', 'hamburguer', 'burger', 'mc donalds', 'mcdonalds', 'bk', 'burger king',
      'subway', 'sushi', 'acai', 'sorvete', 'pastel', 'salgado', 'coxinha', 'marmita', 'quentinha',
      'bar', 'cerveja', 'chopp', 'refrigerante', 'refri', 'doce', 'bolo', 'churrasco', 'espetinho',
      'delivery', 'pao', 'cafeteria', 'starbucks', 'habibs', 'giraffas', 'outback', 'kfc', 'comida',
      'cantina', 'lancheria', 'hot dog', 'cachorro quente', 'tapioca', 'esfiha', 'agua de coco',
    ],
  },
  'Mercado': {
    emoji: '🛒',
    palavras: [
      'mercado', 'supermercado', 'atacadao', 'assai', 'carrefour', 'pao de acucar',
      'hortifruti', 'sacolao', 'feira', 'acougue', 'mercearia', 'atacarejo', 'compras do mes',
      'dia supermercado', 'fort atacadista', 'makro', 'sams club', 'zaffari', 'angeloni', 'condor',
    ],
  },
  'Transporte': {
    emoji: '🚗',
    palavras: [
      'uber', '99', '99pop', 'taxi', 'onibus', 'metro', 'trem', 'passagem', 'gasolina', 'combustivel',
      'etanol', 'alcool', 'diesel', 'posto', 'shell', 'ipiranga', 'petrobras', 'estacionamento',
      'pedagio', 'sem parar', 'oficina', 'mecanico', 'pneu', 'oleo', 'troca de oleo', 'lavagem',
      'lava jato', 'ipva', 'licenciamento', 'multa', 'seguro do carro', 'cabify', 'indrive', 'bilhete unico',
      'recarga transporte', 'moto', 'bicicleta', 'patinete', 'zona azul',
    ],
  },
  'Moradia': {
    emoji: '🏠',
    palavras: [
      'aluguel', 'condominio', 'iptu', 'reforma', 'material de construcao', 'leroy', 'telhanorte',
      'moveis', 'movel', 'faxina', 'diarista', 'manutencao casa', 'encanador', 'eletricista',
      'mudanca', 'financiamento casa', 'prestacao casa',
    ],
  },
  'Contas': {
    emoji: '💡',
    palavras: [
      'luz', 'energia', 'enel', 'cemig', 'copel', 'celesc', 'cpfl', 'coelba', 'agua',
      'sabesp', 'saneamento', 'gas', 'botijao', 'internet', 'wifi', 'vivo', 'claro', 'tim',
      'celular', 'telefone', 'recarga celular', 'fatura', 'boleto', 'conta de', 'tarifa', 'anuidade',
      'juros', 'emprestimo', 'parcela', 'imposto', 'mei', 'taxa bancaria',
    ],
  },
  'Saúde': {
    emoji: '💊',
    palavras: [
      'farmacia', 'remedio', 'medicamento', 'drogasil', 'droga raia', 'raia', 'pague menos',
      'drogaria', 'pacheco', 'panvel', 'medico', 'consulta', 'dentista', 'exame', 'hospital',
      'plano de saude', 'unimed', 'amil', 'hapvida', 'psicologo', 'terapia', 'fisioterapia',
      'oculos', 'lente', 'vacina', 'laboratorio', 'suplemento', 'whey', 'creatina', 'vitamina',
    ],
  },
  'Lazer': {
    emoji: '🎉',
    palavras: [
      'cinema', 'show', 'ingresso', 'festa', 'balada', 'role', 'viagem', 'hotel', 'airbnb', 'pousada',
      'passeio', 'parque', 'jogo', 'game', 'steam', 'playstation', 'psn', 'xbox', 'nintendo',
      'teatro', 'museu', 'praia', 'boliche', 'karaoke', 'futebol', 'estadio', 'aposta', 'bet',
      'passagem aerea', 'voo', 'latam', 'voegol', 'voeazul', 'booking', 'decolar',
    ],
  },
  'Assinaturas': {
    emoji: '📺',
    palavras: [
      'netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'hbo', 'globoplay',
      'youtube premium', 'deezer', 'icloud', 'google one', 'chatgpt', 'claude', 'assinatura',
      'mensalidade app', 'paramount', 'crunchyroll', 'xbox game pass', 'game pass', 'kindle unlimited',
    ],
  },
  'Compras': {
    emoji: '🛍️',
    palavras: [
      'roupa', 'roupas', 'camisa', 'camiseta', 'calca', 'tenis', 'sapato', 'bermuda', 'vestido',
      'shopping', 'loja', 'shein', 'shopee', 'amazon', 'mercado livre', 'magalu', 'magazine',
      'americanas', 'aliexpress', 'renner', 'riachuelo', 'cea', 'c&a', 'zara', 'nike', 'adidas',
      'eletronico', 'fone', 'celular novo', 'notebook', 'computador', 'carregador', 'presente',
      'perfume', 'relogio', 'mochila', 'bolsa', 'acessorio',
    ],
  },
  'Cuidados pessoais': {
    emoji: '💇',
    palavras: [
      'cabelo', 'cabeleireiro', 'barbeiro', 'barbearia', 'corte', 'manicure', 'unha', 'salao',
      'estetica', 'depilacao', 'maquiagem', 'shampoo', 'sabonete', 'desodorante', 'creme',
      'skincare', 'boticario', 'natura', 'academia', 'smartfit', 'smart fit', 'bluefit', 'crossfit',
      'personal', 'pilates', 'higiene',
    ],
  },
  'Educação': {
    emoji: '📚',
    palavras: [
      'curso', 'faculdade', 'escola', 'mensalidade escolar', 'livro', 'livros', 'apostila', 'material escolar',
      'udemy', 'alura', 'coursera', 'ingles', 'idioma', 'aula', 'matricula', 'xerox', 'impressao',
      'certificacao', 'prova', 'vestibular', 'enem',
    ],
  },
  'Pets': {
    emoji: '🐶',
    palavras: [
      'pet', 'racao', 'veterinario', 'petshop', 'pet shop', 'petz', 'cobasi', 'banho e tosa', 'tosa',
      'areia gato', 'cachorro', 'gato', 'vermifugo', 'antipulgas',
    ],
  },
  'Outros': {
    emoji: '📦',
    palavras: [],
  },
};

export const NOMES_CATEGORIAS = Object.keys(CATEGORIAS);

export function emoji(categoria) {
  return CATEGORIAS[categoria]?.emoji ?? '📦';
}

/** "alimentacao", "saude", "lazer" -> nome oficial da categoria (ou null). */
export function acharCategoria(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const exata = NOMES_CATEGORIAS.find((c) => normalizar(c) === t);
  if (exata) return exata;
  // aceita começo do nome: "alim" -> Alimentação, "cuidados" -> Cuidados pessoais
  const parcial = NOMES_CATEGORIAS.filter((c) => normalizar(c).startsWith(t));
  if (parcial.length === 1) return parcial[0];
  // aceita sinônimos simples
  const sinonimos = {
    comida: 'Alimentação', restaurante: 'Alimentação', supermercado: 'Mercado', casa: 'Moradia',
    carro: 'Transporte', uber: 'Transporte', conta: 'Contas', farmacia: 'Saúde', diversao: 'Lazer',
    streaming: 'Assinaturas', roupa: 'Compras', beleza: 'Cuidados pessoais', academia: 'Cuidados pessoais',
    estudo: 'Educação', curso: 'Educação', animal: 'Pets', outro: 'Outros',
  };
  return sinonimos[t] ?? null;
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pré-compila as palavras-chave, das mais longas para as mais curtas
// ("pao de acucar" tem que ganhar de "pao").
const REGRAS = NOMES_CATEGORIAS.flatMap((categoria) =>
  CATEGORIAS[categoria].palavras.map((p) => ({
    categoria,
    palavra: p,
    re: new RegExp(`(^|[^a-z0-9])${escaparRegex(p)}($|[^a-z0-9])`),
  })),
).sort((a, b) => b.palavra.length - a.palavra.length);

/** Categoria pelas palavras-chave fixas, ou null. */
export function categoriaPorPalavraChave(descricao) {
  const t = normalizar(descricao);
  for (const r of REGRAS) {
    if (r.re.test(t)) return r.categoria;
  }
  return null;
}
