#!/usr/bin/env bash
# Pack KDE Store / Get New Widgets KPackages (metadata.json at each archive
# root) for every widget in this repo. A git-archive source tarball is not a
# valid kpackage — that is what produced "Package is not considered valid".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT=""
VALIDATE=0
ONLY=""

usage() {
    echo "Usage: $0 [--only=NAME] [--out=FILE] [--validate]"
    echo "  NAME: supergrok | zai (default: both)"
    echo "  writes dist/<name>-<version>.tar.gz (and .plasmoid if zip is available)"
    echo "  --out=FILE requires --only=NAME"
}

for arg in "$@"; do
    case "$arg" in
        -h|--help)
            usage
            exit 0
            ;;
        --validate) VALIDATE=1 ;;
        --out|--only)
            echo "use $arg=VALUE" >&2
            exit 1
            ;;
        --out=*) OUT="${arg#--out=}" ;;
        --only=*) ONLY="${arg#--only=}" ;;
        *)
            echo "unknown argument: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ -n "$OUT" && -z "$ONLY" ]]; then
    echo "✗ --out=FILE also needs --only=supergrok|zai" >&2
    exit 1
fi
case "$ONLY" in
    ""|supergrok|zai) ;;
    *)
        echo "✗ unknown widget: $ONLY" >&2
        exit 1
        ;;
esac

VERSION="$(node -p "require('./package.json').version")"

WIDGETS=()
if [[ -z "$ONLY" || "$ONLY" == "supergrok" ]]; then
    WIDGETS+=("package-grok|$(node -p "require('./package.json').name")|supergrok-usage-kde-widget|grok")
fi
if [[ -z "$ONLY" || "$ONLY" == "zai" ]]; then
    WIDGETS+=("package-zai|zai-usage-kde-widget|zai-usage-kde-widget|zai")
fi

if [[ ! -f "$ROOT/dist/grok/cli.js" || ! -f "$ROOT/dist/zai/cli.js" ]]; then
    echo "› yarn run build"
    (cd "$ROOT" && yarn run build)
fi
for cli in grok/cli.js zai/cli.js; do
    if [[ ! -f "$ROOT/dist/$cli" ]]; then
        echo "✗ dist/$cli missing after build" >&2
        exit 1
    fi
done

STAGES=()
cleanup() {
    for stage in "${STAGES[@]}"; do
        rm -rf -- "$stage"
    done
}
trap cleanup EXIT

pack_one() {
    local pkg="$1" name="$2" launcher="$3" vendor="$4"
    local pkg_root="$ROOT/$pkg"

    if [[ ! -f "$pkg_root/metadata.json" ]]; then
        echo "✗ missing $pkg_root/metadata.json" >&2
        exit 1
    fi
    if [[ ! -f "$pkg_root/contents/code/$launcher" ]]; then
        echo "✗ missing $pkg_root/contents/code/$launcher" >&2
        exit 1
    fi

    local out="${OUT:-$ROOT/dist/${name}-${VERSION}.tar.gz}"
    mkdir -p "$(dirname "$out")"

    local stage
    stage="$(mktemp -d)"
    STAGES+=("$stage")

    cp -a "$pkg_root/." "$stage/"
    install -d "$stage/contents/code/cli"
    cp -a "$ROOT"/dist/*.js "$stage/contents/code/cli/"
    cp -a "$ROOT/dist/$vendor" "$stage/contents/code/cli/"
    chmod 0755 "$stage/contents/code/$launcher"

    if [[ -f "$ROOT/LICENSE" ]]; then
        cp -a "$ROOT/LICENSE" "$stage/LICENSE"
    fi

    if [[ ! -f "$stage/metadata.json" ]]; then
        echo "✗ staged tree has no metadata.json at root" >&2
        exit 1
    fi

    local members=(metadata.json contents)
    if [[ -f "$stage/LICENSE" ]]; then
        members+=(LICENSE)
    fi

    local tmp="${out}.tmp"
    # Explicit members — no leading "./", no nested package-*/ prefix.
    (
        cd "$stage"
        tar -czf "$tmp" -- "${members[@]}"
    )

    # Read the listing once: piping tar straight into grep races SIGPIPE under
    # pipefail (grep exits on first match, tar gets EPIPE, pipeline fails).
    local listing
    listing="$(tar -tzf "$tmp")"

    if ! grep -qx "metadata.json" <<< "$listing"; then
        echo "✗ archive does not have metadata.json at the root" >&2
        rm -f -- "$tmp"
        exit 1
    fi
    if grep -qE '(^|/)package(-grok|-zai)?/' <<< "$listing"; then
        echo "✗ archive nests package dirs — Get New Widgets will reject it" >&2
        rm -f -- "$tmp"
        exit 1
    fi

    mv -f -- "$tmp" "$out"
    echo "› wrote $out"

    local plasmoid="${out%.tar.gz}.plasmoid"
    if command -v zip >/dev/null 2>&1; then
        (
            cd "$stage"
            zip -qr "$plasmoid" -- "${members[@]}"
        )
        echo "› wrote $plasmoid"
    fi

    if [[ "$VALIDATE" -eq 1 ]]; then
        if ! command -v kpackagetool6 >/dev/null 2>&1; then
            echo "✗ kpackagetool6 not found" >&2
            exit 1
        fi
        local id
        id="$(node -p "require('$stage/metadata.json').KPlugin.Id")"
        kpackagetool6 --type Plasma/Applet --remove "$id" >/dev/null 2>&1 || true
        kpackagetool6 --type Plasma/Applet --install "$out"
        kpackagetool6 --type Plasma/Applet --show "$id" >/dev/null
        kpackagetool6 --type Plasma/Applet --remove "$id"
        echo "› kpackagetool6 accepted $out"
    fi
}

for widget in "${WIDGETS[@]}"; do
    IFS='|' read -r pkg name launcher vendor <<< "$widget"
    pack_one "$pkg" "$name" "$launcher" "$vendor"
done
