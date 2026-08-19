#!/usr/bin/env bash
# Remove the user install (applet, helper, cache). Does not touch grok login.
set -euo pipefail

IDS=(com.rj-xy.supergrokusage com.rj.supergrokusage)
BIN_DEST="$HOME/.local/bin/supergrok-usage-kde-widget"
CACHE_DIR="$HOME/.cache/supergrok-usage-kde-widget"

if command -v kpackagetool6 >/dev/null 2>&1; then
    for id in "${IDS[@]}"; do
        kpackagetool6 --type Plasma/Applet --remove "$id" >/dev/null 2>&1 || true
    done
fi

for id in "${IDS[@]}"; do
    dest="$HOME/.local/share/plasma/plasmoids/$id"
    if [[ -L "$dest" || -e "$dest" ]]; then
        rm -rf -- "$dest"
        echo "› removed $dest"
    fi
done

if [[ -L "$BIN_DEST" || -e "$BIN_DEST" ]]; then
    rm -f -- "$BIN_DEST"
    echo "› removed $BIN_DEST"
fi

if [[ -d "$CACHE_DIR" ]]; then
    rm -rf -- "$CACHE_DIR"
    echo "› removed $CACHE_DIR"
fi

if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
fi

echo "Uninstalled SuperGrok Usage (grok login left in place)"
