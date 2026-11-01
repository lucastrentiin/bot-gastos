# 🤖 Bot de Gastos no WhatsApp

Você manda no WhatsApp o que gastou, ele categoriza, soma tudo e no dia 1º de cada mês te manda um relatório com onde o dinheiro foi e onde dá pra cortar.

**Não precisa de número secundário.** O bot entra na sua própria conta como "aparelho conectado" (igual o WhatsApp Web) e só lê a conversa **"Você"** (aquela de mandar mensagem pra si mesmo). Os seus outros chats ele ignora.

## Como usar

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
3. **IA (Claude)**, só se você configurar a chave da API. Ele guarda a resposta, então cada gasto novo só passa pela IA uma vez.
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

## Instalação num servidor (VPS)

Precisa de um servidor Linux ligado 24h. Opções: **Oracle Cloud Free Tier** (grátis), Hetzner, Contabo, Magalu Cloud, DigitalOcean (a partir de ~R$ 20/mês). A menor máquina já serve.

### 1. Instalar o Docker no servidor

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Baixar o bot

```bash
git clone https://github.com/SEU_USUARIO/bot-gastos.git
cd bot-gastos
cp .env.example .env
nano .env        # cole sua ANTHROPIC_API_KEY (opcional)
```

### 3. Ligar e conectar o WhatsApp

```bash
docker compose up -d --build
docker compose logs -f
```

Vai aparecer um **QR code** no terminal. No celular: **WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho** e escaneie.

> Se o QR ficar deformado no terminal, coloque seu número em `WHATSAPP_NUMERO` no `.env` (ex: `5511999998888`), rode `docker compose up -d` de novo, e use **"Conectar com número de telefone"** no celular com o código de 8 letras que aparece no log.

Quando aparecer `✅ Conectado`, aperte `Ctrl+C` pra sair dos logs (o bot continua rodando). Mande `ajuda` na conversa com você mesmo pra testar.

### Comandos úteis

```bash
docker compose logs -f          # ver o que está acontecendo
docker compose restart          # reiniciar
git pull && docker compose up -d --build   # atualizar
```

### Backup

Todos os dados ficam na pasta `dados/`:
- `dados/gastos.db`: seus gastos (SQLite; abre no [DB Browser for SQLite](https://sqlitebrowser.org/) ou exporta pra Excel)
- `dados/sessao-whatsapp/`: login do WhatsApp. **Não compartilhe essa pasta**, ela dá acesso à sua conta.

Pra fazer backup é só copiar `dados/gastos.db`.

### Desconectar

No celular: **Aparelhos conectados → Bot de Gastos → Desconectar**. Pra conectar de novo, apague `dados/sessao-whatsapp/` e reinicie o bot.

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
- A IA só recebe a descrição e o valor do gasto ("paintball", R$ 80), nunca suas conversas.
