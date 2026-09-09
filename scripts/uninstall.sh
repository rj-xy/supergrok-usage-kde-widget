#!/usr/bin/env bash
# Remove the user installs (applets, helpers, caches). Does not touch grok or
# opencode logins.
set -euo pipefail

# Never use kpackagetool6 --remove here: while the applet dests are symlinks
# into this repo it follows the link and deletes package-grok/package-zai.
# Removing the dests below plus kbuildsycoca6 unregisters them just as well.
IDS=(com.rj-xy.zaiusage com.rj.supergrokusage com.rj-xy.supergrokusage)
BIN_DESTS=(
    "$HOME/.local/bin/supergrok-usage-kde-widget"
    "$HOME/.local/bin/zai-usage-kde-widget"
)
CACHE_DIRS=(
    "$HOME/.cache/supergrok-usage-kde-widget"
    "$HOME/.cache/zai-usage-kde-widget"
)

for id in "${IDS[@]}"; do
    dest="$HOME/.local/share/plasma/plasmoids/$id"
    if [[ -L "$dest" || -e "$dest" ]]; then
        rm -rf -- "$dest"
        echo "› removed $dest"
    fi
done

for bin_dest in "${BIN_DESTS[@]}"; do
    if [[ -L "$bin_dest" || -e "$bin_dest" ]]; then
        rm -f -- "$bin_dest"
        echo "› removed $bin_dest"
    fi
done

for cache_dir in "${CACHE_DIRS[@]}"; do
    if [[ -d "$cache_dir" ]]; then
        rm -rf -- "$cache_dir"
        echo "› removed $cache_dir"
    fi
done

if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
fi

echo "Uninstalled SuperGrok Usage and Z.ai Usage (logins left in place)"
