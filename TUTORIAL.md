# 📲 Tutorial: colocando o Bot de Gastos no ar

Tempo total: uns **15 minutos**, a maior parte esperando. No servidor você só cola **um comando**.

---

## Passo 1: Pegar a chave grátis do Gemini (2 min, opcional)

A chave serve pra IA categorizar gastos que o bot não conhece ("paintball", "lojinha da esquina"). Sem ela o bot funciona do mesmo jeito, mas esses vão pra "Outros" e você corrige com `mudar`.

1. Entre em **https://aistudio.google.com/apikey** com sua conta Google
2. Clique em **Create API key** (Criar chave de API)
3. Copie a chave (começa com `AIza...`) e guarde. Você vai colar no Passo 3.

> 🔒 Não mande essa chave pra ninguém, nem aqui no chat. Ela só vai no seu servidor.

---

## Passo 2: Criar o servidor (5 min)

Qualquer servidor Linux (Ubuntu ou Debian) serve. A opção grátis pra sempre é a **Oracle Cloud**:

1. Crie a conta em **https://www.oracle.com/br/cloud/free/**. Ela pede cartão só pra verificar, não cobra.
2. No painel: **Compute → Instances → Create instance**
3. **Image:** Ubuntu 24.04 · **Shape:** `VM.Standard.A1.Flex` (ARM, grátis) com 1 OCPU e 6 GB
4. Em **Add SSH keys**, escolha **Generate a key pair** e **baixe a chave privada**
5. Clique em **Create** e espere ficar verde (Running). Copie o **Public IP**.

> Prefere pagar ~R$ 20 a 30/mês e não ter dor de cabeça? Hetzner, Contabo, Magalu Cloud ou DigitalOcean funcionam igual: crie uma máquina Ubuntu com 1 GB de RAM ou mais.

### Entrando no servidor

**Windows:** abra o **PowerShell**. **Mac/Linux:** abra o **Terminal**. Digite:

```bash
ssh -i CAMINHO_DA_CHAVE_BAIXADA ubuntu@IP_DO_SERVIDOR
```

Exemplo: `ssh -i Downloads\ssh-key.key ubuntu@150.230.10.20`. Se perguntar "Are you sure...?", digite `yes`.

> No Mac/Linux, se reclamar das permissões da chave: `chmod 600 CAMINHO_DA_CHAVE`

---

## Passo 3: Instalar o bot (1 comando, ~5 min)

Já dentro do servidor, cole:

```bash
curl -fsSL https://raw.githubusercontent.com/lucastrentiin/bot-gastos/main/instalar.sh | sudo bash
```

O script faz tudo sozinho: instala o Docker, baixa o bot e monta o container. Ele só pergunta duas coisas:

1. **"Cole a chave do Gemini"** → cole a chave do Passo 1 (ou aperte Enter pra pular)
2. **"Número com DDI e DDD"** → seu WhatsApp só com números, ex.: `5511999998888`

---

## Passo 4: Conectar o WhatsApp (1 min)

Quando o script pedir, vai aparecer um **código de 8 letras** (tipo `ABCD-1234`). No celular:

1. Abra o WhatsApp → **⋮** (Android) ou **Configurações** (iPhone)
2. **Aparelhos conectados → Conectar aparelho**
3. Toque em **"Conectar com número de telefone"** (embaixo da câmera)
4. Digite o código

Quando aparecer **✅ Pronto!** no terminal, acabou. Pode fechar o terminal, que o bot continua rodando.

> Se você deixou o número em branco, aparece um QR code no lugar do código. É só escanear.
> Se o código expirar, rode `bot-gastos reconectar`.

---

## Passo 5: Testar

No WhatsApp, abra a conversa com **você mesmo** (pesquise seu nome ou "Você" nos contatos) e mande:

```
ajuda
```

Depois teste um gasto:

```
mercado 50
```

Se o bot responder com 🤖, está tudo funcionando. 🎉

---

## Dia a dia no servidor

Você quase nunca vai precisar entrar no servidor. Ele liga sozinho se reiniciar. Quando precisar, depois do `ssh`:

| Comando | Pra quê |
|---|---|
| `bot-gastos logs` | Ver o que está acontecendo (Ctrl+C pra sair) |
| `bot-gastos reiniciar` | Reiniciar o bot |
| `bot-gastos atualizar` | Baixar a versão nova do bot |
| `bot-gastos config` | Mudar a chave da IA ou o número |
| `bot-gastos backup` | Salvar uma cópia dos seus gastos |
| `bot-gastos reconectar` | Conectar o WhatsApp de novo |

---

## Problemas comuns

**O bot não responde**
→ Rode `bot-gastos logs`. Se aparecer "desconectou este aparelho", rode `bot-gastos reconectar`.
→ Confira se você está mandando na conversa **com você mesmo**. Em outras conversas ele não responde, de propósito.

**`curl: (22) ... 404`** no Passo 3
→ O repositório no GitHub está privado ou ainda não existe. Ele precisa ser **público** pra esse comando funcionar.

**Gasto caiu na categoria errada**
→ Manda `mudar 12 mercado` (12 é o número que aparece na resposta). Ele aprende e da próxima vez acerta.

**Quero ver os gastos no Excel**
→ `bot-gastos backup`, depois baixe o arquivo no seu PC com `scp -i CHAVE ubuntu@IP:~/gastos-*.db .` e abra no [DB Browser for SQLite](https://sqlitebrowser.org/) (tem botão de exportar pra CSV).
