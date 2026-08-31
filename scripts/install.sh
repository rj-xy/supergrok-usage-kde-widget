#!/usr/bin/env bash
# Install both usage fetchers (SuperGrok + Z.ai) and Plasma 6 widgets for the
# current user. Default is a symlink so edits in this checkout apply after a
# plasmashell restart.
#
# Never use kpackagetool on a dest that is a symlink into this repo: it follows
# the link and deletes package-grok/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COPY=0
ADD_PANEL=0

for arg in "$@"; do
    case "$arg" in
        --copy) COPY=1 ;;
        --add-to-panel) ADD_PANEL=1 ;;
        -h|--help)
            echo "Usage: $0 [--copy] [--add-to-panel]"
            echo "  --copy           copy files instead of symlinking this checkout"
            echo "  --add-to-panel   add both widgets to the first Plasma panel"
            exit 0
            ;;
        *)
            echo "unknown argument: $arg" >&2
            exit 1
            ;;
    esac
done

if command -v yarn >/dev/null 2>&1; then
    if [[ ! -d "$ROOT/node_modules/typescript" ]]; then
        echo "› yarn install"
        (cd "$ROOT" && yarn install)
    fi
    echo "› yarn run build"
    (cd "$ROOT" && yarn run build)
elif [[ ! -f "$ROOT/dist/grok/cli.js" || ! -f "$ROOT/dist/zai/cli.js" ]]; then
    echo "✗ yarn not found and dist/ is missing — install Yarn (corepack enable)" >&2
    exit 1
fi

install -d "$HOME/.local/bin"
install -d "$HOME/.local/share/plasma/plasmoids"

install_widget() {
    local pkg="$1" id="$2" launcher="$3" bin_dest="$4" env_prefix="$5" vendor="$6"
    local pkg_root="$ROOT/$pkg"
    local applet_dest="$HOME/.local/share/plasma/plasmoids/$id"

    if [[ ! -f "$pkg_root/metadata.json" || ! -f "$pkg_root/contents/code/$launcher" ]]; then
        echo "✗ missing $pkg_root — restore it (git checkout -- $pkg) then retry" >&2
        exit 1
    fi
    chmod 0755 "$pkg_root/contents/code/$launcher"

    # Drop dest links first so later writes do not follow them into the repo.
    if [[ -L "$applet_dest" ]]; then
        rm -f -- "$applet_dest"
    elif [[ -e "$applet_dest" ]]; then
        rm -rf -- "$applet_dest"
    fi
    if [[ -L "$bin_dest" || -e "$bin_dest" ]]; then
        rm -f -- "$bin_dest"
    fi

    if [[ "$COPY" -eq 1 ]]; then
        cat > "$bin_dest" <<EOF
#!/usr/bin/env bash
export ${env_prefix}_ROOT=$(printf '%q' "$ROOT")
exec $(printf '%q' "$pkg_root/contents/code/$launcher") "\$@"
EOF
        chmod 0755 "$bin_dest"
        echo "› wrote $bin_dest (${env_prefix}_ROOT=$ROOT)"
        cp -a "$pkg_root" "$applet_dest"
        install -d "$applet_dest/contents/code/cli"
        cp -a "$ROOT"/dist/*.js "$applet_dest/contents/code/cli/"
        cp -a "$ROOT/dist/$vendor" "$applet_dest/contents/code/cli/"
        echo "› copied applet → $applet_dest"
    else
        ln -sfn "$pkg_root/contents/code/$launcher" "$bin_dest"
        echo "› linked $bin_dest → $pkg_root/contents/code/$launcher"
        ln -sfn "$pkg_root" "$applet_dest"
        echo "› linked $applet_dest → $pkg_root"
    fi
}

install_widget package-grok com.rj-xy.supergrokusage supergrok-usage-kde-widget \
    "$HOME/.local/bin/supergrok-usage-kde-widget" SUPERGROK grok
install_widget package-zai com.rj-xy.zaiusage zai-usage-kde-widget \
    "$HOME/.local/bin/zai-usage-kde-widget" ZAI zai

if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
fi

echo
echo "Widgets: SuperGrok Usage + Z.ai Usage"
echo "After QML edits:  yarn run plasma:restart"
echo "Test:             ~/.local/bin/supergrok-usage-kde-widget --pretty"
echo "                  ~/.local/bin/zai-usage-kde-widget --pretty"
echo "Add to panel:     yarn widget:panel"

if [[ "$ADD_PANEL" -eq 1 ]]; then
    if command -v qdbus6 >/dev/null 2>&1; then
        QDBUS=qdbus6
    elif command -v qdbus >/dev/null 2>&1; then
        QDBUS=qdbus
    else
        echo "✗ qdbus not found; add the widgets from the panel menu" >&2
        exit 1
    fi
    for id in com.rj-xy.supergrokusage com.rj-xy.zaiusage; do
        "$QDBUS" org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript "
            var already = false;
            var panels = panels();
            for (var i = 0; i < panels.length; i++) {
                var widgets = panels[i].widgets();
                for (var j = 0; j < widgets.length; j++) {
                    if (widgets[j].type === '${id}')
                        already = true;
                }
            }
            if (already) {
                print('already on a panel');
            } else if (panels.length > 0) {
                panels[0].addWidget('${id}');
                print('added to panel');
            } else {
                print('no panel found');
            }
        "
    done
fi
