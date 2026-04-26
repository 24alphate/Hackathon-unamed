#!/usr/bin/env bash
# Run on Ubuntu/Debian (e.g. Hetzner): install Docker, clone repo, docker compose up.
#
#   curl -fsSL https://raw.githubusercontent.com/24alphate/Hackathon-unamed/main/deploy/install-on-server.sh | bash
#
# Optional: pass API key from your shell (otherwise edit /opt/hackathon-unamed/.env after):
#   export OPENAI_API_KEY="sk-..."
#   curl -fsSL ... | bash

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/24alphate/Hackathon-unamed.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/hackathon-unamed}"

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  echo "Run as root. Optional: REPO_URL, INSTALL_DIR, OPENAI_API_KEY, GITHUB_TOKEN"
  exit 0
fi

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root (sudo bash or ssh root@your-server)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "==> git pull $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "==> git clone -> $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ ! -f .env ]]; then
  cp deploy/env.example .env
fi

# Optional: write keys from environment (values should not contain newlines)
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  if grep -q '^OPENAI_API_KEY=' .env; then
    sed -i.bak '/^OPENAI_API_KEY=/d' .env
  fi
  printf '%s\n' "OPENAI_API_KEY=$OPENAI_API_KEY" >> .env
fi
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  if grep -q '^GITHUB_TOKEN=' .env; then
    sed -i.bak '/^GITHUB_TOKEN=/d' .env
  fi
  printf '%s\n' "GITHUB_TOKEN=$GITHUB_TOKEN" >> .env
fi

echo "==> docker compose up -d --build (first run: long install)..."
docker compose up -d --build

IP="$(curl -fsSL -4 --connect-timeout 3 https://ifconfig.me 2>/dev/null || true)"
[[ -z "$IP" ]] && IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "==> OK. UI:  http://${IP}/"
echo "    Health: http://${IP}/api/health"
echo "    Dir:    $INSTALL_DIR"
echo "    Env:    nano $INSTALL_DIR/.env"
echo "    Logs:   cd $INSTALL_DIR && docker compose logs -f"
