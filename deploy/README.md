# Hetzner (or any VPS) with Docker

This stack runs the **full** app: Vite static UI, FastAPI with **sentence-transformers** and **Chroma**, SQLite on a persistent volume.

## One-time on the server

1. Install Docker + Compose plugin: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) (or your distro’s instructions).
2. Open port **80** in the Hetzner **Firewall** (and **443** if you add TLS later).
3. Clone the repo, `cd` into it, copy `deploy/env.example` to `.env` and set at least `OPENAI_API_KEY`.

## Start

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
