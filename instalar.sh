#!/usr/bin/env bash
# Instala (ou atualiza) o Bot de Gastos num servidor Linux, do zero.
# Uso:  curl -fsSL https://raw.githubusercontent.com/lucastrentiin/bot-gastos/main/instalar.sh | sudo bash
set -euo pipefail

REPO="${REPO:-lucastrentiin/bot-gastos}"
PASTA="${PASTA:-/opt/bot-gastos}"

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

# Lê do teclado mesmo quando o script vem por "curl | bash"
perguntar() {
  local texto="$1" var="$2" resposta=""
  if [ -r /dev/tty ]; then read -r -p "$texto" resposta < /dev/tty || true; fi
  printf -v "$var" '%s' "$resposta"
}

[ "$(id -u)" -eq 0 ] || erro "Rode como root: curl -fsSL ... | sudo bash"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  verde "==> Instalando o Docker (1 a 3 minutos)..."
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || erro "Docker Compose não encontrado. Instale o plugin docker-compose-plugin."

# 2. Código
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git >/dev/null; } || true
if [ -d "$PASTA/.git" ]; then
  verde "==> Atualizando o código..."
  git -C "$PASTA" pull --ff-only -q
else
  verde "==> Baixando o bot para $PASTA..."
  git clone -q "https://github.com/$REPO.git" "$PASTA"
fi
cd "$PASTA"

# 3. Configuração (só na primeira vez)
if [ ! -f .env ]; then
  cp .env.example .env
  echo
  verde "==> Configuração"
  echo "Chave de IA para categorizar gastos desconhecidos (opcional, pode pular com Enter)."
  echo "Gemini grátis em: https://aistudio.google.com/apikey"
  perguntar "Cole a chave do Gemini (ou Enter para pular): " CHAVE
  if [ -n "$CHAVE" ]; then
    sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$CHAVE|" .env
  fi
  echo
  echo "Seu número de WhatsApp, para conectar com código (mais fácil que QR code pelo terminal)."
  perguntar "Número com DDI e DDD, só dígitos, ex 5511999998888 (Enter = usar QR code): " NUMERO
  NUMERO="$(printf '%s' "$NUMERO" | tr -cd '0-9')"
  if [ -n "$NUMERO" ]; then
    sed -i "s|^WHATSAPP_NUMERO=.*|WHATSAPP_NUMERO=$NUMERO|" .env
  fi
  chmod 600 .env
fi

# 4. Atalho "bot-gastos" para o dia a dia
cat > /usr/local/bin/bot-gastos <<'EOF'
#!/usr/bin/env bash
# Docker precisa de root: se não for, roda de novo com sudo
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"
PASTA="__PASTA__"
cd "$PASTA" || exit 1
case "${1:-}" in
  logs)       docker compose logs -f --tail=100 ;;
  reiniciar)  docker compose restart ;;
  parar)      docker compose down ;;
  ligar)      docker compose up -d ;;
  atualizar)  git pull --ff-only && docker compose up -d --build ;;
  config)     ${EDITOR:-nano} .env && docker compose up -d ;;
  backup)
    # cópia segura mesmo com o bot gravando
    docker compose exec -T bot node -e "const D=require('better-sqlite3');new D('/app/dados/gastos.db').backup('/app/dados/backup.db').then(()=>{})" || exit 1
    DESTINO="${SUDO_USER:+$(getent passwd "$SUDO_USER" | cut -d: -f6)}"; DESTINO="${DESTINO:-$HOME}"
    f="$DESTINO/gastos-$(date +%F).db"
    mv dados/backup.db "$f" && chown "${SUDO_USER:-root}" "$f" && echo "Backup salvo em $f" ;;
  reconectar) docker compose down && rm -rf dados/sessao-whatsapp && docker compose up -d && docker compose logs -f --tail=50 ;;
  *) echo "Uso: bot-gastos {logs|reiniciar|parar|ligar|atualizar|config|backup|reconectar}" ;;
esac
EOF
sed -i "s|__PASTA__|$PASTA|" /usr/local/bin/bot-gastos
chmod +x /usr/local/bin/bot-gastos

# 5. Sobe o container
verde "==> Montando e ligando o bot (a primeira vez leva uns 2 minutos)..."
mkdir -p dados
docker compose up -d --build

if [ -f dados/sessao-whatsapp/creds.json ] && grep -q '"me":' dados/sessao-whatsapp/creds.json 2>/dev/null; then
  verde "✅ Bot atualizado e rodando. Já estava conectado ao WhatsApp."
  exit 0
fi

echo
amarelo "==> Agora conecte o WhatsApp."
amarelo "    No celular: WhatsApp > ⋮ (ou Configurações) > Aparelhos conectados > Conectar aparelho"
if grep -q '^WHATSAPP_NUMERO=[0-9]' .env; then
  amarelo "    Toque em \"Conectar com número de telefone\" e digite o código que vai aparecer abaixo."
else
  amarelo "    Escaneie o QR code que vai aparecer abaixo."
fi
echo

# Mostra os logs até conectar
docker compose logs -f --tail=0 &
LOGS_PID=$!
trap 'kill $LOGS_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 600); do
  if docker compose logs --tail=200 2>/dev/null | grep -q 'Conectado como'; then
    sleep 2
    kill $LOGS_PID 2>/dev/null || true
    echo
    verde "✅ Pronto! Abra a conversa com você mesmo no WhatsApp e mande: ajuda"
    verde "   Comandos do servidor: bot-gastos logs | reiniciar | atualizar | config | backup"
    exit 0
  fi
  sleep 1
done
kill $LOGS_PID 2>/dev/null || true
amarelo "Ainda não conectou. Para tentar de novo: bot-gastos reconectar"
