#!/usr/bin/env bash
set -euo pipefail

# Deploy phase-server from GitHub Release artifacts
# Usage: ./deploy.sh [version]
#   version: tag like "v0.1.0" (default: latest release)

INSTALL_DIR="/opt/phase-server"
SERVICE="phase-server"
REPO="phase-rs/phase"
ARTIFACT="phase-server-linux-x86_64"

VERSION="${1:-latest}"

if [ "$VERSION" = "latest" ]; then
    echo "Fetching latest release..."
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | jq -r .tag_name)
fi

echo "Deploying phase-server ${VERSION}..."

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARTIFACT}.tar.gz"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${DOWNLOAD_URL}..."
curl -fsSL -o "${TMP_DIR}/server.tar.gz" "$DOWNLOAD_URL"
tar xzf "${TMP_DIR}/server.tar.gz" -C "$TMP_DIR"

echo "Stopping ${SERVICE}..."
sudo systemctl stop "$SERVICE" 2>/dev/null || true

echo "Installing binary and data..."
sudo cp "${TMP_DIR}/phase-server" "${INSTALL_DIR}/phase-server"
sudo chmod +x "${INSTALL_DIR}/phase-server"
sudo mkdir -p "${INSTALL_DIR}/data"
sudo cp "${TMP_DIR}/data/card-data.json" "${INSTALL_DIR}/data/card-data.json"
sudo chown -R phase:phase "${INSTALL_DIR}"

echo "Starting ${SERVICE}..."
sudo systemctl start "$SERVICE"
sudo systemctl status "$SERVICE" --no-pager

echo "Deploy complete: phase-server ${VERSION}"
