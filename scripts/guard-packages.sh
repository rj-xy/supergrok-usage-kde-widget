#!/usr/bin/env bash
# Guard: package-grok/ and package-zai/ are symlinked into
# ~/.local/share/plasma/plasmoids, and "kpackagetool6 --remove <id>" (also
# "Uninstall Widget" in the Plasma UI, or scripts that call it) follows those
# links and deletes the tracked files inside this repo.
#
# Every entry point (build, install, dist, release) runs this guard first: if
# the package dirs lost files, restore them from git instead of failing with a
# confusing "missing metadata.json".
#
# Source it after ROOT is set:
#   source "$ROOT/scripts/guard-packages.sh"
#   guard_packages
# or run it standalone:  bash scripts/guard-packages.sh
set -euo pipefail

GUARD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

_guard_intact() {
    local pkg
    for pkg in package-grok package-zai; do
        [[ -f "${ROOT:-$GUARD_ROOT}/$pkg/metadata.json" ]] || return 1
    done
    return 0
}

guard_packages() {
    _guard_intact && return 0

    echo "⚠️ package-grok/package-zai lost files — kpackagetool --remove followed the plasmoid symlink" >&2
    if [[ "$(git -C "${ROOT:-$GUARD_ROOT}" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]]; then
        echo "▶️ git checkout -- package-grok package-zai" >&2
        if ! git -C "${ROOT:-$GUARD_ROOT}" checkout -- package-grok package-zai; then
            echo "✗ git restore failed" >&2
            exit 1
        fi
    fi
    if ! _guard_intact; then
        echo "✗ package files still missing — restore them with: git checkout -- package-grok package-zai" >&2
        exit 1
    fi
    echo "✔ restored package-grok/package-zai from git" >&2
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    guard_packages
fi
