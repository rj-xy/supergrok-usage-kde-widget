#!/usr/bin/env bash
# Install the SuperGrok usage fetcher and Plasma 6 widget for the current user.
# Default is a symlink so edits in this checkout apply after a plasmashell restart.
#
# Never use kpackagetool on a dest that is a symlink into this repo: it follows
# the link and deletes package/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="com.rj-xy.supergrokusage"
BIN_DEST="$HOME/.local/bin/supergrok-usage-kde-widget"
LAUNCHER="$ROOT/package/contents/code/supergrok-usage-kde-widget"
APPLET_DEST="$HOME/.local/share/plasma/plasmoids/$ID"
COPY=0
ADD_PANEL=0

for arg in "$@"; do
    case "$arg" in
        --copy) COPY=1 ;;
        --add-to-panel) ADD_PANEL=1 ;;
        -h|--help)
            echo "Usage: $0 [--copy] [--add-to-panel]"
            echo "  --copy           copy files instead of symlinking this checkout"
            echo "  --add-to-panel   add the widget to the first Plasma panel"
            exit 0
            ;;
        *)
            echo "unknown argument: $arg" >&2
            exit 1
            ;;
    esac
done

if [[ ! -f "$ROOT/package/metadata.json" || ! -f "$LAUNCHER" ]]; then
    echo "✗ missing $ROOT/package — restore it (git checkout -- package) then retry" >&2
    exit 1
fi
chmod 0755 "$LAUNCHER"

if command -v npm >/dev/null 2>&1; then
    if [[ ! -d "$ROOT/node_modules/typescript" ]]; then
        echo "› npm install"
        (cd "$ROOT" && npm install)
    fi
    echo "› npm run build"
    (cd "$ROOT" && npm run build)
elif [[ ! -f "$ROOT/dist/cli.js" ]]; then
    echo "✗ node/npm not found and dist/ is missing — install Node.js 20+" >&2
    exit 1
fi

install -d "$HOME/.local/bin"
install -d "$(dirname "$APPLET_DEST")"

# Drop dest links first so later writes do not follow them into the repo.
if [[ -L "$APPLET_DEST" ]]; then
    rm -f -- "$APPLET_DEST"
elif [[ -e "$APPLET_DEST" ]]; then
    rm -rf -- "$APPLET_DEST"
fi
if [[ -L "$BIN_DEST" || -e "$BIN_DEST" ]]; then
    rm -f -- "$BIN_DEST"
fi

if [[ "$COPY" -eq 1 ]]; then
    cat > "$BIN_DEST" <<EOF
#!/usr/bin/env bash
export SUPERGROK_ROOT=$(printf '%q' "$ROOT")
exec $(printf '%q' "$LAUNCHER") "\$@"
EOF
    chmod 0755 "$BIN_DEST"
    echo "› wrote $BIN_DEST (SUPERGROK_ROOT=$ROOT)"
    cp -a "$ROOT/package" "$APPLET_DEST"
    install -d "$APPLET_DEST/contents/code/cli"
    cp -a "$ROOT/dist/cli.js" "$ROOT/dist/consts.js" "$ROOT/dist/fetcher.js" \
        "$ROOT/dist/logic.js" "$ROOT/dist/types.js" "$APPLET_DEST/contents/code/cli/"
    echo "› copied applet → $APPLET_DEST"
else
    ln -sfn "$LAUNCHER" "$BIN_DEST"
    echo "› linked $BIN_DEST → $LAUNCHER"
    ln -sfn "$ROOT/package" "$APPLET_DEST"
    echo "› linked $APPLET_DEST → $ROOT/package"
fi

if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
fi

echo
echo "Widget: SuperGrok Usage"
echo "After QML edits:  npm run plasma:restart"
echo "Test:             $BIN_DEST --pretty"
echo "Add to panel:     npm run install:panel"

if [[ "$ADD_PANEL" -eq 1 ]]; then
    if command -v qdbus6 >/dev/null 2>&1; then
        QDBUS=qdbus6
    elif command -v qdbus >/dev/null 2>&1; then
        QDBUS=qdbus
    else
        echo "✗ qdbus not found; add the widget from the panel menu" >&2
        exit 1
    fi
    "$QDBUS" org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript "
        var already = false;
        var panels = panels();
        for (var i = 0; i < panels.length; i++) {
            var widgets = panels[i].widgets();
            for (var j = 0; j < widgets.length; j++) {
                if (widgets[j].type === '${ID}')
                    already = true;
            }
        }
        if (already) {
            print('already on a panel');
        } else if (panels.length > 0) {
            panels[0].addWidget('${ID}');
            print('added to panel');
        } else {
            print('no panel found');
        }
    "
fi
