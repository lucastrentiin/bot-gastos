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
command -v apt-get >/dev/null 2>&1 || erro "Este instalador é para Ubuntu/Debian. Crie o servidor com a imagem Ubuntu 24.04."

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  verde "==> Instalando o Docker (1 a 3 minutos)..."
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || erro "Docker Compose não encontrado. Instale o plugin docker-compose-plugin."

# 1b. Máquina com pouca memória (ex.: Oracle E2.1.Micro, 1 GB): cria 2 GB de swap
#     senão a montagem do bot (compilação do SQLite) pode travar por falta de RAM
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "${MEM_MB:-0}" -lt 1800 ] && [ "$(awk 'NR>1' /proc/swaps | wc -l)" -eq 0 ]; then
  verde "==> Pouca memória (${MEM_MB} MB): criando 2 GB de swap..."
  if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

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

# Login do WhatsApp concluído? ("account" só existe depois de parear de verdade)
conectado() { grep -q '"account"' dados/sessao-whatsapp/creds.json 2>/dev/null; }
valor_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
gravar_env() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

# 3. Configuração: pergunta o que estiver faltando (enquanto não estiver conectado)
[ -f .env ] || cp .env.example .env
chmod 600 .env
if ! conectado; then
  if [ -z "$(valor_env GEMINI_API_KEY)" ] && [ -z "$(valor_env ANTHROPIC_API_KEY)" ]; then
    echo
    verde "==> Chave de IA (opcional)"
    echo "Serve para categorizar gastos que o bot não conhece. Gemini grátis em: https://aistudio.google.com/apikey"
    perguntar "Cole a chave do Gemini (ou Enter para pular): " CHAVE
    CHAVE="$(printf '%s' "$CHAVE" | tr -d '[:space:]')"
    [ -n "$CHAVE" ] && gravar_env GEMINI_API_KEY "$CHAVE"
  fi
  if [ -z "$(valor_env WHATSAPP_NUMERO)" ]; then
    echo
    verde "==> Seu número de WhatsApp"
    echo "Com ele o bot gera um código para digitar no celular (mais fácil que QR code)."
    perguntar "Número com DDI e DDD, só dígitos, ex 5511999998888 (Enter = usar QR code): " NUMERO
    NUMERO="$(printf '%s' "$NUMERO" | tr -cd '0-9')"
    [ -n "$NUMERO" ] && gravar_env WHATSAPP_NUMERO "$NUMERO"
  fi
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
  reconectar) docker compose down && rm -rf dados/sessao-whatsapp && docker compose up -d --force-recreate && echo "Aguarde o código/QR (uns 10 s). Ctrl+C para sair depois de conectar." && docker compose logs -f --tail=all --no-log-prefix | grep --line-buffered -v '^{' ;;
  qr)
    # conectar por QR code (não depende do número)
    sed -i 's|^WHATSAPP_NUMERO=.*|WHATSAPP_NUMERO=|' .env
    exec "$0" reconectar ;;
  codigo)
    # conectar por código: bot-gastos codigo 5511999998888
    n="$(printf '%s' "${*:2}" | tr -cd '0-9')"
    [ -n "$n" ] || { echo "Uso: bot-gastos codigo 5511999998888"; exit 1; }
    if grep -q '^WHATSAPP_NUMERO=' .env; then sed -i "s|^WHATSAPP_NUMERO=.*|WHATSAPP_NUMERO=$n|" .env; else echo "WHATSAPP_NUMERO=$n" >> .env; fi
    exec "$0" reconectar ;;
  *) echo "Uso: bot-gastos {logs|reiniciar|parar|ligar|atualizar|config|backup|reconectar|qr|codigo NUMERO}" ;;
esac
EOF
sed -i "s|__PASTA__|$PASTA|" /usr/local/bin/bot-gastos
chmod +x /usr/local/bin/bot-gastos

# 5. Sobe o container
verde "==> Montando e ligando o bot (a primeira vez leva uns 2 minutos)..."
mkdir -p dados

if conectado; then
  docker compose up -d --build
  verde "✅ Bot atualizado e rodando. Já estava conectado ao WhatsApp."
  exit 0
fi

# Não conectado: começa do zero (apaga tentativa de login pela metade) e mostra o log desde o início
docker compose down >/dev/null 2>&1 || true
rm -rf dados/sessao-whatsapp
docker compose up -d --build --force-recreate

echo
amarelo "==> Agora conecte o WhatsApp."
amarelo "    No celular: WhatsApp > ⋮ (ou Configurações) > Aparelhos conectados > Conectar aparelho"
if [ -n "$(valor_env WHATSAPP_NUMERO)" ]; then
  amarelo "    Toque em \"Conectar com número de telefone\" e digite o CÓDIGO que vai aparecer abaixo."
else
  amarelo "    Escaneie o QR code que vai aparecer abaixo."
fi
amarelo "    (O código demora uns 10 segundos para aparecer.)"
echo

# Mostra o log (desde o início do container) até conectar
docker compose logs -f --tail=all --no-log-prefix 2>/dev/null | grep --line-buffered -v '^{' &
LOGS_PID=$!
trap 'kill $LOGS_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 600); do
  if conectado && docker compose logs --tail=200 2>/dev/null | grep -q 'Conectado como'; then
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
amarelo "Ainda não conectou (10 minutos). Para tentar de novo: bot-gastos reconectar"
