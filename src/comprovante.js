// Lê um print/PDF com o Gemini e devolve a LISTA de pagamentos que aparecem nele.
// Serve para: comprovante único (Pix, cartão, nota fiscal) e print da tela de
// notificações/extrato do banco, que tem várias compras de uma vez.
import { NOMES_CATEGORIAS } from './categorias.js';
import { chamarGemini } from './gemini.js';
import { hojeISO } from './util.js';

function montarPrompt(hoje, legenda) {
  return `Esta imagem/PDF é de um brasileiro registrando os próprios gastos. Pode ser:
- um comprovante único (Pix, transferência, boleto pago, cartão, maquininha, nota fiscal, cupom fiscal), ou
- um print da tela de notificações ou do extrato do app do banco, com VÁRIOS pagamentos.

Hoje é ${hoje}. Use isso para descobrir o ano quando a data aparecer só como "1 de novembro" ou "01/11".

Liste em "transacoes" TODO dinheiro que SAIU e já foi pago:
compra aprovada no cartão, Pix enviado, transferência enviada, boleto pago, débito, nota/cupom fiscal (use o TOTAL).

NÃO liste: Pix ou dinheiro RECEBIDO, boleto novo ou "a vencer" (ainda não foi pago), lembretes, avisos,
propaganda, saldo, limite, fatura apenas "fechada", estornos, compras recusadas.

Itens CORTADOS no topo ou no rodapé do print também contam: se dá para ler o valor e para quem foi
(ex.: "Você enviou R$ 257,25 para FULANO", "Compra aprovada de R$ 23,64 em LOJA"), liste, mesmo sem o título.

Se a mesma notificação aparecer repetida na lista (mesmo valor, mesmo recebedor, mesmo horário),
liste cada ocorrência: podem ser pagamentos separados.

Para cada transação:
- valor: em reais, como número (ex.: 23.64)
- recebedor: quem recebeu, curto (nome da loja/pessoa/órgão). Sem CPF/CNPJ, sem "LTDA", sem "*" e códigos.
  Ex.: "99Food *99Food" -> "99Food"; "59.947.336 MILENA" -> "Milena"; "ANTHROPIC* SUB" -> "Anthropic"
- data: AAAA-MM-DD do pagamento ("" se não der para saber)
- hora: HH:MM do pagamento ("" se não aparecer)
- categoria: uma de ${NOMES_CATEGORIAS.join(', ')}. Imposto, taxa e guia do governo = "Contas".
  Pix para pessoa física sem pista do que foi comprado = "Outros".

Em "ignorados", liste bem curto o que você viu e NÃO contou, com o motivo
(ex.: "boleto a vencer R$ 257,25", "propaganda", "Pix recebido R$ 50"). Lista vazia se não houver.

Se não houver nenhum pagamento, devolva "transacoes": [].${
    legenda ? `\n\nO usuário escreveu junto: "${legenda}" (use para escolher a categoria).` : ''
  }`;
}

/**
 * @param {Buffer} arquivo  bytes da imagem ou PDF
 * @param {string} mime     ex.: image/jpeg, application/pdf
 * @param {string} legenda  texto que veio junto (ajuda a categorizar)
 * @returns {Promise<{transacoes: Array<{valor:number, recebedor:string, data:string, hora:string, categoria:string}>}>}
 */
export async function lerComprovanteGemini(arquivo, mime, legenda = '', hoje = hojeISO()) {
  const texto = await chamarGemini({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime, data: arquivo.toString('base64') } },
          { text: montarPrompt(hoje, legenda) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          transacoes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                valor: { type: 'NUMBER' },
                recebedor: { type: 'STRING' },
                data: { type: 'STRING' },
                hora: { type: 'STRING' },
                categoria: { type: 'STRING', enum: NOMES_CATEGORIAS },
              },
              required: ['valor', 'recebedor', 'data', 'hora', 'categoria'],
            },
          },
          ignorados: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['transacoes', 'ignorados'],
      },
    },
  });
  if (!texto) throw new Error('Gemini não devolveu resposta');
  const lido = JSON.parse(texto);
  console.log(`[comprovante] Gemini leu: ${JSON.stringify(lido).slice(0, 1500)}`);
  return lido;
}
