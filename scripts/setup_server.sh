#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SEODirect — Server Setup Script
# Run once on a fresh Ubuntu VPS as root
# Usage: bash setup_server.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="seo.valesios.ru"
APP_DIR="/opt/seodirect"

echo "══════════════════════════════════════"
echo "  SEODirect Server Setup"
echo "══════════════════════════════════════"

# ── 1. System update ─────────────────────────────────────────────────────────
echo "[1/7] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Swap (2 GB) ──────────────────────────────────────────────────────────
echo "[2/7] Setting up swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Reduce swappiness for better performance
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo "  Swap created: 2 GB"
else
    echo "  Swap already exists"
fi

# ── 3. Firewall ──────────────────────────────────────────────────────────────
echo "[3/7] Configuring firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable
echo "  Firewall: SSH + HTTP + HTTPS only"

# ── 4. Docker ────────────────────────────────────────────────────────────────
echo "[4/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "  Docker installed"
else
    echo "  Docker already installed"
fi

# Docker Compose plugin (v2)
if ! docker compose version &> /dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi
echo "  Docker Compose: $(docker compose version --short)"

# ── 5. Let's Encrypt SSL ────────────────────────────────────────────────────
echo "[5/7] Setting up SSL certificate..."
apt-get install -y -qq certbot
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --email admin@valesios.ru
    echo "  SSL certificate obtained for ${DOMAIN}"
else
    echo "  SSL certificate already exists"
fi

# Auto-renewal cron (renew + reload nginx)
cat > /etc/cron.d/certbot-renew << 'CRON'
0 3 * * * root certbot renew --quiet --deploy-hook "docker compose -f /opt/seodirect/docker-compose.prod.yml exec -T nginx nginx -s reload" 2>/dev/null
CRON
echo "  SSL auto-renewal configured"

# ── 6. App directory ─────────────────────────────────────────────────────────
echo "[6/7] Creating app directory..."
mkdir -p "${APP_DIR}"
echo "  Directory: ${APP_DIR}"

# ── 7. SSH key for GitHub Actions CD ─────────────────────────────────────────
echo "[7/7] Setting up deploy SSH key..."
DEPLOY_KEY="${HOME}/.ssh/deploy_key"
if [ ! -f "${DEPLOY_KEY}" ]; then
    ssh-keygen -t ed25519 -f "${DEPLOY_KEY}" -N "" -C "github-actions-deploy"
    cat "${DEPLOY_KEY}.pub" >> "${HOME}/.ssh/authorized_keys"
    chmod 600 "${HOME}/.ssh/authorized_keys"
    echo ""
    echo "══════════════════════════════════════"
    echo "  DEPLOY KEY (add to GitHub Secrets)"
    echo "  Settings → Secrets → SERVER_SSH_KEY"
    echo "══════════════════════════════════════"
    cat "${DEPLOY_KEY}"
    echo ""
    echo "══════════════════════════════════════"
else
    echo "  Deploy key already exists"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Copy the deploy key above"
echo "  2. Go to GitHub repo → Settings → Secrets and variables → Actions"
echo "  3. Add these secrets:"
echo "     SERVER_HOST = 194.154.24.189"
echo "     SERVER_USER = root"
echo "     SERVER_SSH_KEY = (the private key above)"
echo ""
echo "  4. Create .env on server:"
echo "     nano ${APP_DIR}/.env"
echo "     (copy from .env.example and fill in real values)"
echo ""
echo "  5. Push to main → CI/CD will deploy automatically"
echo "══════════════════════════════════════"
