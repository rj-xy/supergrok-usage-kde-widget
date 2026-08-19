#!/usr/bin/env bash
# Pack a KDE Store / Get New Widgets KPackage (metadata.json at the archive root).
# A git-archive source tarball is not a valid kpackage — that is what produced
# "Package is not considered valid".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT=""
VALIDATE=0

usage() {
    echo "Usage: $0 [--out FILE] [--validate]"
    echo "  writes dist/<name>-<version>.tar.gz (and .plasmoid if zip is available)"
}

for arg in "$@"; do
    case "$arg" in
        -h|--help)
            usage
            exit 0
            ;;
        --validate) VALIDATE=1 ;;
        --out)
            echo "use --out=FILE" >&2
            exit 1
            ;;
        --out=*) OUT="${arg#--out=}" ;;
        *)
            echo "unknown argument: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ ! -f "$ROOT/package/metadata.json" ]]; then
    echo "✗ missing $ROOT/package/metadata.json" >&2
    exit 1
fi

if [[ ! -f "$ROOT/package/contents/code/supergrok-usage-kde-widget" ]]; then
    echo "✗ missing package launcher" >&2
    exit 1
fi

if [[ ! -f "$ROOT/dist/cli.js" ]]; then
    echo "› npm run build"
    (cd "$ROOT" && npm run build)
fi

if [[ ! -f "$ROOT/dist/cli.js" ]]; then
    echo "✗ dist/cli.js missing after build" >&2
    exit 1
fi

NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
ID="$(node -p "require('./package/metadata.json').KPlugin.Id")"
OUT="${OUT:-$ROOT/dist/${NAME}-${VERSION}.tar.gz}"

mkdir -p "$(dirname "$OUT")"

STAGE="$(mktemp -d)"
cleanup() { rm -rf -- "$STAGE"; }
trap cleanup EXIT

cp -a "$ROOT/package/." "$STAGE/"
install -d "$STAGE/contents/code/cli"
cp -a "$ROOT/dist/cli.js" "$ROOT/dist/consts.js" "$ROOT/dist/fetcher.js" \
    "$ROOT/dist/logic.js" "$ROOT/dist/types.js" "$STAGE/contents/code/cli/"
chmod 0755 "$STAGE/contents/code/supergrok-usage-kde-widget"

if [[ -f "$ROOT/LICENSE" ]]; then
    cp -a "$ROOT/LICENSE" "$STAGE/LICENSE"
fi

if [[ ! -f "$STAGE/metadata.json" ]]; then
    echo "✗ staged tree has no metadata.json at root" >&2
    exit 1
fi

TMP="${OUT}.tmp"
# Explicit members — no leading "./", no nested package/ prefix.
(
    cd "$STAGE"
    members=(metadata.json contents)
    [[ -f LICENSE ]] && members+=(LICENSE)
    tar -czf "$TMP" -- "${members[@]}"
)

if ! tar -tzf "$TMP" | grep -qx "metadata.json"; then
    echo "✗ archive does not have metadata.json at the root" >&2
    rm -f -- "$TMP"
    exit 1
fi
if tar -tzf "$TMP" | grep -q "package/metadata.json"; then
    echo "✗ archive nests package/ — Get New Widgets will reject it" >&2
    rm -f -- "$TMP"
    exit 1
fi

mv -f -- "$TMP" "$OUT"
echo "› wrote $OUT"

PLASMOID="${OUT%.tar.gz}.plasmoid"
if command -v zip >/dev/null 2>&1; then
    (
        cd "$STAGE"
        members=(metadata.json contents)
        [[ -f LICENSE ]] && members+=(LICENSE)
        zip -qr "$PLASMOID" -- "${members[@]}"
    )
    echo "› wrote $PLASMOID"
fi

if [[ "$VALIDATE" -eq 1 ]]; then
    if ! command -v kpackagetool6 >/dev/null 2>&1; then
        echo "✗ kpackagetool6 not found" >&2
        exit 1
    fi
    kpackagetool6 --type Plasma/Applet --remove "$ID" >/dev/null 2>&1 || true
    kpackagetool6 --type Plasma/Applet --install "$OUT"
    kpackagetool6 --type Plasma/Applet --show "$ID" >/dev/null
    kpackagetool6 --type Plasma/Applet --remove "$ID"
    echo "› kpackagetool6 accepted $OUT"
fi
