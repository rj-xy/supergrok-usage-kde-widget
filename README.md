# SuperGrok Usage

KDE Plasma 6 widget for the weekly SuperGrok pool: percent used, reset time, and the Build / Chat / Imagine split.

![Panel chip showing Grok 20% used](screenshots/taskbar-widget.png)

The panel shows the weekly percent. Click it for the product split and reset time:

![Popup with 20% used, Grok Build 15%, Chat 3%, Imagine 2%](screenshots/taskbar-widget-expanded.png)

Sign in once with `grok login`.

All three `install:*` commands build the project first, then put two things on your account:

- `~/.local/bin/supergrok-usage-kde-widget` — the command the widget runs to fetch usage
- `~/.local/share/plasma/plasmoids/com.rj-xy.supergrokusage` — the Plasma applet

They differ only in **how** those files are installed, and whether the applet is dropped onto the panel.

⚡**`npm run install:panel`** — usual first install. Links this checkout into the two paths above (a symlink, not a copy), then adds **SuperGrok Usage** to your first Plasma panel. Edits here show up after `npm run build` and `npm run plasma:restart`.

⚡**`npm run install:widget`** — same symlink install, but does **not** add or move anything on the panel. Use this if the applet is already there and you only want to refresh the install, or if you will add it yourself (*Right-click panel → Add Widgets… → SuperGrok Usage*).

⚡**`npm run install:copy`** — copies the launcher and applet instead of linking this folder. Plasma no longer depends on this checkout. Later edits here do nothing until you run install again. It does not add the widget to the panel.

```bash
npm run build            # compile TypeScript (needed after src/ or QML helper edits)
npm run plasma:restart   # reload the panel so it picks up QML / logic.js
npm test                 # build, then run tests
```

After a QML or `src/logic.ts` change, `npm run build` then `npm run plasma:restart`.

Based on [kde-ai-usage](https://github.com/Muddyblack/kde-ai-usage) and [ai-usagebar](https://github.com/akitaonrails/ai-usagebar).
