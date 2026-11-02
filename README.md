# 🤖 Bot de Gastos no WhatsApp

Você manda no WhatsApp o que gastou, ele categoriza, soma tudo e no dia 1º de cada mês te manda um relatório com onde o dinheiro foi e onde dá pra cortar.

**Não precisa de número secundário.** O bot entra na sua própria conta como "aparelho conectado" (igual o WhatsApp Web) e só lê a conversa **"Você"** (aquela de mandar mensagem pra si mesmo). Os seus outros chats ele ignora.

## Como usar

**📸 Comprovante:** mande o **print ou o PDF** do comprovante (Pix, cartão, maquininha, nota fiscal) na conversa com você mesmo. O Gemini lê o valor, quem recebeu e a data, e o bot categoriza. Você pode escrever uma legenda na foto, ex. "bolo", pra ajudar na categoria (útil em Pix pra pessoa física). Se mandar o mesmo comprovante duas vezes, ele avisa. *Precisa da chave do Gemini.*

**✍️ Ou por texto:**

Abra a conversa com você mesmo no WhatsApp e mande:

```
mercado 87,50
uber 23
ontem ifood 45,90
15/10 farmácia 32
```

Dá pra mandar vários gastos de uma vez, um por linha. O bot responde:

```
🤖 ✅ Anotado
🛒 mercado: R$ 87,50 → Mercado · #12
Total do mês: R$ 1.340,20
```

| Comando | O que faz |
|---|---|
| `resumo` | Mês atual até agora, com projeção de quanto vai fechar |
| `relatorio` | Relatório completo do mês passado (`relatorio setembro` pra outro mês) |
| `hoje` / `semana` | Total do dia / dos últimos 7 dias |
| `ultimos` | Últimos 10 lançamentos com o número de cada um |
| `buscar uber` | Procura gastos e soma |
| `desfazer` | Apaga o último gasto |
| `apagar 12` | Apaga o gasto #12 |
| `mudar 12 lazer` | Troca a categoria. **O bot aprende** e acerta da próxima vez |
| `orcamento alimentacao 800` | Limite mensal. Avisa quando chegar em 80% e quando passar |
| `orcamento` | Mostra como estão os limites |
| `renda 3500` | Sua renda, pra calcular quanto sobra |
| `categorias` | Lista as categorias |
| `ajuda` | Mostra os comandos |

### Categorias

🍔 Alimentação · 🛒 Mercado · 🚗 Transporte · 🏠 Moradia · 💡 Contas · 💊 Saúde · 🎉 Lazer · 📺 Assinaturas · 🛍️ Compras · 💇 Cuidados pessoais · 📚 Educação · 🐶 Pets · 📦 Outros

Pra escolher a categoria, o bot tenta nesta ordem:
1. **O que você já ensinou** com `mudar`
2. **Palavras-chave** (ifood → Alimentação, uber → Transporte...). Ficam em `src/categorias.js`, dá pra acrescentar as suas.
3. **IA (Gemini ou Claude)**, só se você configurar uma chave de API. Ele guarda a resposta, então cada gasto novo só passa pela IA uma vez.
4. **Outros**, e ele te avisa como corrigir.

### Relatório mensal

No dia 1º, às 9h, chega na sua conversa:
- total do mês e comparação com o mês anterior
- quanto da renda foi gasto e quanto sobrou
- quanto foi por categoria, em reais e %, com a variação
- situação dos orçamentos
- os 5 maiores gastos
- **onde dá pra economizar**: categoria que mais subiu, quantos deliverys, gastos pequenos que somam muito, custo anual das assinaturas, meta de guardar 20% da renda

Se o bot estiver desligado no dia 1º, ele manda o relatório assim que voltar.

---

## Instalação no servidor

**👉 Passo a passo completo: [TUTORIAL.md](TUTORIAL.md)**

Resumo: num servidor Ubuntu/Debian, cole um comando:

```bash
curl -fsSL https://raw.githubusercontent.com/lucastrentiin/bot-gastos/main/instalar.sh | sudo bash
```

O script instala o Docker, baixa o bot, pergunta a chave da IA e o seu número, sobe **um único container** e mostra o código pra conectar o WhatsApp. Depois disso use o atalho `bot-gastos` (`logs`, `reiniciar`, `atualizar`, `config`, `backup`, `reconectar`).

Os dados ficam em `/opt/bot-gastos/dados/`:
- `gastos.db`: seus gastos (SQLite)
- `sessao-whatsapp/`: login do WhatsApp. **Não compartilhe essa pasta**, ela dá acesso à sua conta.

---

## Rodar no seu PC (para testar)

Precisa do Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env
npm start
npm test        # roda os testes
```

## Avisos

- O bot usa o [Baileys](https://github.com/WhiskeySockets/Baileys), uma biblioteca **não oficial** do WhatsApp Web. Como ele só lê e responde a conversa com você mesmo, sem mandar nada pra ninguém, o risco de bloqueio é bem baixo, mas não é zero.
- A IA (Gemini ou Claude) só recebe a descrição e o valor do gasto ("paintball", R$ 80), nunca suas conversas.
