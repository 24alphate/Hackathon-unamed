# Hetzner (or any VPS) with Docker

This stack runs the **full** app: Vite static UI, FastAPI with **sentence-transformers** and **Chroma**, SQLite on a persistent volume.

## One-time on the server

1. **Hetzner Cloud firewall:** allow **TCP 22** (SSH) and **TCP 80** (HTTP).
2. **SSH in** as `root` (or use `sudo` for the commands below).

### Option A — one command (installs Docker, clones, starts)

```bash
curl -fsSL https://raw.githubusercontent.com/24alphate/Hackathon-unamed/main/deploy/install-on-server.sh | bash
```

Optional: set your key first (or edit `/opt/hackathon-unamed/.env` after):

```bash
export OPENAI_API_KEY="sk-..."
curl -fsSL https://raw.githubusercontent.com/24alphate/Hackathon-unamed/main/deploy/install-on-server.sh | bash
```

Install path is **`/opt/hackathon-unamed`** (override with `INSTALL_DIR` if you export it before the script).

### Option B — manual

1. Install Docker + Compose: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
2. Clone the repo, `cp deploy/env.example .env`, set `OPENAI_API_KEY`, then:

```bash
docker compose up -d --build
```

- UI: `http://YOUR_SERVER_IP/`
- API health: `http://YOUR_SERVER_IP/api/health`

The **first** start can take **several minutes** (PyTorch + models + DB init). The API `healthcheck` allows up to ~7 minutes before marking unhealthy.

## Data

- SQLite and Chroma live in a Docker **named volume** `api_data` (not in the git tree).

## Stop / update

```bash
docker compose down
git pull
docker compose up -d --build
```

## HTTPS (recommended)

Point your domain’s **A record** to the server, then use **Caddy** or **Certbot** with Nginx in front of `web`, or put **Caddy** on the host and reverse-proxy to `127.0.0.1:80`. Do not commit TLS certificates.

## Differences from Vercel

- No serverless size limit; the **same** `backend/requirements.txt` is installed in the `api` image.
- You maintain the OS, firewall, and updates.
