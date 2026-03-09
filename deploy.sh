#!/usr/bin/env bash
# Deploy built cards to Home Assistant config (www folder).
# Usage: HA_CONFIG=/path/to/ha/config ./deploy.sh
#    or: ./deploy.sh /path/to/ha/config

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="${SCRIPT_DIR}/dist"
HA_CONFIG="${HA_CONFIG:-$1}"

if [[ -z "$HA_CONFIG" ]]; then
  echo "Usage: HA_CONFIG=/path/to/ha/config ./deploy.sh"
  echo "   or: ./deploy.sh /path/to/ha/config"
  echo "Example: ./deploy.sh ~/.homeassistant"
  echo "Example (Docker in repo): ./deploy.sh ../homie-docker-config"
  exit 1
fi

# resolve home dir
HA_CONFIG="${HA_CONFIG/#\~/$HOME}"
TARGET="${HA_CONFIG}/www/homie"
STORAGE="${HA_CONFIG}/.storage/lovelace_resources"

if [[ ! -d "$DIST" ]]; then
  echo "Run build first: cd src/climate/slots && bash build.sh && cd - && node build-bundle.js"
  exit 1
fi

# Deploy timestamp: YYYYMMDD_HHMMSS for cache bust, full for comment
DEPLOY_VER="$(date +%Y%m%d_%H%M%S)"
DEPLOY_COMMENT="$(date '+%Y-%m-%d %H:%M:%S')"

deploy_with_comment() {
  local src="$1"
  local dest="$2"
  if [[ -f "$src" ]]; then
    { echo "/* Deployed: ${DEPLOY_COMMENT} */"; cat "$src"; } > "$dest"
    echo "  $dest"
  fi
}

mkdir -p "$TARGET"
echo "Deploying (${DEPLOY_COMMENT})..."
deploy_with_comment "$DIST/homie-scheduler-cards.js" "$TARGET/homie-scheduler-cards.js"
deploy_with_comment "$DIST/homie-scheduler-climate-slots.js" "$TARGET/homie-scheduler-climate-slots.js"
deploy_with_comment "$DIST/homie-scheduler-boiler-slots.js" "$TARGET/homie-scheduler-boiler-slots.js"
deploy_with_comment "$DIST/homie-scheduler-boiler-button.js" "$TARGET/homie-scheduler-boiler-button.js"
deploy_with_comment "$DIST/homie-scheduler-boiler-status.js" "$TARGET/homie-scheduler-boiler-status.js"
deploy_with_comment "$DIST/homie-custom-styles.css" "$TARGET/homie-custom-styles.css"

# Update lovelace_resources cache version (Docker/HA config)
if [[ -f "$STORAGE" ]]; then
  sed -i.bak \
    -e "s|homie-custom-styles.css?v=[0-9_]*|homie-custom-styles.css?v=${DEPLOY_VER}|g" \
    -e "s|homie-scheduler-boiler-slots.js?v=[0-9_]*|homie-scheduler-boiler-slots.js?v=${DEPLOY_VER}|g" \
    -e "s|homie-scheduler-climate-slots.js?v=[0-9_]*|homie-scheduler-climate-slots.js?v=${DEPLOY_VER}|g" \
    -e "s|homie-scheduler-boiler-button.js?v=[0-9_]*|homie-scheduler-boiler-button.js?v=${DEPLOY_VER}|g" \
    -e "s|homie-scheduler-boiler-status.js?v=[0-9_]*|homie-scheduler-boiler-status.js?v=${DEPLOY_VER}|g" \
    "$STORAGE"
  rm -f "${STORAGE}.bak"
  echo "Updated lovelace_resources ?v=${DEPLOY_VER}"
else
  echo "Note: $STORAGE not found, skipping cache version update"
fi

echo "Done. Restart HA or clear frontend cache to load new version."
