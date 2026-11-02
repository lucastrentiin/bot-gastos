// Lê um comprovante (print ou PDF) com o Gemini e devolve valor, recebedor, data e categoria.
import { NOMES_CATEGORIAS } from './categorias.js';
import { chamarGemini } from './gemini.js';

const PROMPT = `Esta imagem/PDF deveria ser um comprovante de pagamento brasileiro: Pix, transferência, boleto,
cartão, maquininha, nota fiscal ou cupom fiscal.

Extraia:
- eh_comprovante: true se for mesmo um comprovante de pagamento/compra feito pelo dono do celular
- valor: o valor PAGO, em reais, como número (ex.: 87.5). Em nota fiscal, use o TOTAL. Ignore saldo, limite e troco.
- recebedor: quem recebeu o dinheiro, curto (nome da loja/estabelecimento ou nome da pessoa). Sem CPF/CNPJ, sem "LTDA".
- data: data do pagamento no formato AAAA-MM-DD, ou "" se não aparecer
- categoria: uma de ${NOMES_CATEGORIAS.join(', ')}. Pix para pessoa física sem pista do que foi comprado = "Outros".

Se não for comprovante, eh_comprovante=false e o resto pode ficar vazio/zero.`;

/**
 * @param {Buffer} arquivo  bytes da imagem ou PDF
 * @param {string} mime     ex.: image/jpeg, application/pdf
 * @param {string} legenda  texto que veio junto (ajuda a categorizar)
 * @returns {Promise<{eh_comprovante:boolean, valor:number, recebedor:string, data:string, categoria:string}>}
 */
export async function lerComprovanteGemini(arquivo, mime, legenda = '') {
  const partes = [
    { inlineData: { mimeType: mime, data: arquivo.toString('base64') } },
    { text: PROMPT + (legenda ? `\n\nO usuário escreveu junto: "${legenda}" (use para escolher a categoria).` : '') },
  ];
  const texto = await chamarGemini({
    contents: [{ role: 'user', parts: partes }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          eh_comprovante: { type: 'BOOLEAN' },
          valor: { type: 'NUMBER' },
          recebedor: { type: 'STRING' },
          data: { type: 'STRING' },
          categoria: { type: 'STRING', enum: NOMES_CATEGORIAS },
        },
        required: ['eh_comprovante', 'valor', 'recebedor', 'data', 'categoria'],
      },
    },
  });
  if (!texto) throw new Error('Gemini não devolveu resposta');
  return JSON.parse(texto);
}
