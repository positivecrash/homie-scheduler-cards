#!/bin/bash
# Homie Scheduler Cards - Installation Script
# Copies dist/ (built cards + homie-custom-styles.css) to Home Assistant.
# Usage: bash install.sh /path/to/homeassistant/config

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: bash install.sh /path/to/config${NC}"
    echo "Example: bash install.sh /config"
    exit 1
fi

HA_CONFIG="$1"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BLUE}Homie Scheduler Cards – Installation${NC}"
echo "Project: $PROJECT_DIR"
echo "HA Config: $HA_CONFIG"
echo ""

if [ ! -d "$HA_CONFIG" ]; then
    echo -e "${RED}Error: HA config directory not found: $HA_CONFIG${NC}"
    exit 1
fi

if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo -e "${RED}Error: dist/ not found. Build cards first:${NC}"
    echo "  cd src/boiler/button && bash build.sh"
    echo "  cd src/boiler/slots && bash build.sh"
    echo "  cd src/boiler/status && bash build.sh"
    echo "  cd src/climate/slots && bash build.sh"
    exit 1
fi

mkdir -p "$HA_CONFIG/www/homie"
for f in "$PROJECT_DIR/dist"/*.js "$PROJECT_DIR/dist"/homie-custom-styles.css; do
    [ -f "$f" ] && cp "$f" "$HA_CONFIG/www/homie/" && echo -e "  ${GREEN}✓${NC} $(basename "$f")"
done

echo ""
echo -e "${GREEN}Done.${NC} Add resources in Lovelace (Settings → Dashboards → Resources):"
echo "  One resource: /local/homie/homie-scheduler-cards.js (JavaScript Module)"
echo "  Optional: /local/homie/homie-custom-styles.css (Stylesheet)"
echo "Then add cards (e.g. type: custom:homie-scheduler-boiler-slots)."
