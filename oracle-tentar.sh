#!/usr/bin/env bash
# Tenta criar o servidor GRÁTIS da Oracle até conseguir vaga.
# Roda no Cloud Shell da Oracle (já vem logado na sua conta):
#   curl -fsSL https://raw.githubusercontent.com/lucastrentiin/bot-gastos/main/oracle-tentar.sh | bash
#
# Alterna entre VM.Standard.A1.Flex (ARM, 1 CPU / 6 GB) e VM.Standard.E2.1.Micro (1 GB),
# os dois do plano Always Free, com Ubuntu 24.04, na rede pública que você já criou.
set -uo pipefail

NOME="${NOME:-servidor-lucas}"
ESPERA="${ESPERA:-60}"           # segundos entre tentativas
REDE="${REDE:-}"                 # nome da rede (VCN); vazio = a primeira que tiver sub-rede pública
CHAVE_PUB="${CHAVE_PUB:-}"       # arquivo .pub; vazio = procura no seu home do Cloud Shell

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
erro() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v oci >/dev/null || erro "Rode isto no Cloud Shell da Oracle (ícone >_ no topo do console)."

# --- Conta (compartimento raiz) ---
C="${OCI_TENANCY:-}"
if [ -z "$C" ]; then
  C="$(oci iam compartment list --include-root --query 'data[?"compartment-id"==null].id | [0]' --raw-output 2>/dev/null)"
fi
[ -n "$C" ] && [ "$C" != "null" ] || erro "Não achei sua conta (tenancy). Abra o Cloud Shell pelo console da Oracle."

# --- Já existe? (não cria duas) ---
EXISTE="$(oci compute instance list --compartment-id "$C" --display-name "$NOME" \
  --query 'data[?"lifecycle-state"!=`TERMINATED` && "lifecycle-state"!=`TERMINATING`].id | [0]' --raw-output 2>/dev/null)"
if [ -n "$EXISTE" ] && [ "$EXISTE" != "null" ]; then
  IP="$(oci compute instance list-vnics --instance-id "$EXISTE" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
  verde "✅ O servidor '$NOME' já existe. IP público: ${IP:-ainda sem IP}"
  exit 0
fi

# --- Chave SSH pública ---
if [ -z "$CHAVE_PUB" ]; then
  CHAVE_PUB="$(ls -t "$HOME"/*.pub "$HOME"/.ssh/*.pub 2>/dev/null | head -1)"
fi
[ -n "$CHAVE_PUB" ] && [ -f "$CHAVE_PUB" ] || erro "Não achei a chave pública (.pub). No Cloud Shell: menu ⚙/☰ > Upload > escolha o arquivo .pub que você baixou da Oracle. Depois rode de novo."
verde "==> Chave SSH: $CHAVE_PUB"

# --- Domínio de disponibilidade ---
AD="$(oci iam availability-domain list --compartment-id "$C" --query 'data[0].name' --raw-output)"
[ -n "$AD" ] && [ "$AD" != "null" ] || erro "Não achei o domínio de disponibilidade."

# --- Sub-rede pública ---
if [ -n "$REDE" ]; then
  VCNS="$(oci network vcn list --compartment-id "$C" --display-name "$REDE" --query 'data[].id' --raw-output | tr -d '[]", ' | grep . )"
else
  VCNS="$(oci network vcn list --compartment-id "$C" --query 'data[].id' --raw-output | tr -d '[]", ' | grep . )"
fi
SUB=""
for V in $VCNS; do
  SUB="$(oci network subnet list --compartment-id "$C" --vcn-id "$V" \
    --query 'data[?"prohibit-public-ip-on-vnic"==`false`].id | [0]' --raw-output 2>/dev/null)"
  [ -n "$SUB" ] && [ "$SUB" != "null" ] && break
  SUB=""
done
[ -n "$SUB" ] || erro "Não achei uma sub-rede pública. Crie a rede com: Networking > Redes virtuais > Ações > Iniciar assistente de VCN > 'Criar VCN com conectividade de Internet'."
verde "==> Sub-rede pública: ok"

# --- Imagem Ubuntu 24.04 para cada tipo de máquina ---
imagem() {
  oci compute image list --compartment-id "$C" --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04" --shape "$1" --sort-by TIMECREATED --sort-order DESC \
    --query 'data[?!contains("display-name", `Minimal`)].id | [0]' --raw-output 2>/dev/null
}
IMG_A1="$(imagem VM.Standard.A1.Flex)"
IMG_MICRO="$(imagem VM.Standard.E2.1.Micro)"
[ -n "$IMG_A1$IMG_MICRO" ] || erro "Não achei a imagem Ubuntu 24.04."

tentar() { # $1 = forma
  local forma="$1" img extra=()
  if [ "$forma" = VM.Standard.A1.Flex ]; then
    img="$IMG_A1"; extra=(--shape-config '{"ocpus":1,"memoryInGBs":6}')
  else
    img="$IMG_MICRO"
  fi
  [ -n "$img" ] && [ "$img" != "null" ] || return 2
  oci compute instance launch --compartment-id "$C" --availability-domain "$AD" \
    --shape "$forma" "${extra[@]}" --image-id "$img" --subnet-id "$SUB" --assign-public-ip true \
    --display-name "$NOME" --ssh-authorized-keys-file "$CHAVE_PUB" \
    --query 'data.id' --raw-output 2>&1
}

verde "==> Tentando criar o servidor grátis a cada ${ESPERA}s. Deixe esta aba aberta."
amarelo "    (pode levar horas; Ctrl+C para parar)"
n=0
while true; do
  n=$((n + 1))
  for FORMA in VM.Standard.A1.Flex VM.Standard.E2.1.Micro; do
    SAIDA="$(tentar "$FORMA")"; COD=$?
    ID="$(printf '%s' "$SAIDA" | grep -o 'ocid1\.instance\.[A-Za-z0-9._-]*' | tail -1)"
    if [ $COD -eq 0 ] && [ -n "$ID" ]; then
      verde "🎉 Conseguiu! Criado $FORMA. Esperando ligar..."
      oci compute instance get --instance-id "$ID" --wait-for-state RUNNING --max-wait-seconds 600 >/dev/null 2>&1
      IP="$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
      verde "✅ Servidor pronto!  IP público: ${IP:-veja na página da instância}"
      verde "   Entre com:  ssh -i SUA_CHAVE_PRIVADA.key ubuntu@${IP:-IP}"
      exit 0
    fi
    if echo "$SAIDA" | grep -qiE 'capacity|capacidade'; then
      printf '%s  tentativa %d: sem vaga para %s\n' "$(date +%H:%M:%S)" "$n" "$FORMA"
    elif echo "$SAIDA" | grep -qiE 'TooManyRequests|429'; then
      printf '%s  Oracle pediu calma (muitas tentativas), esperando mais...\n' "$(date +%H:%M:%S)"
      sleep 120
    elif [ $COD -eq 2 ]; then
      : # sem imagem para essa forma, pula
    else
      amarelo "Erro diferente de 'sem vaga' — parei para não insistir à toa:"
      echo "$SAIDA" | head -15
      exit 1
    fi
  done
  sleep "$ESPERA"
done
