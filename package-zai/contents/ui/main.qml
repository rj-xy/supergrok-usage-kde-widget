pragma ComponentBehavior: Bound

import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as Plasma5Support
import org.kde.kirigami as Kirigami
import "../code/logic.js" as Logic

PlasmoidItem {
    id: root

    property var entry: null
    property string failure: ""
    property string pendingCommand: ""
    property double nowMs: 0

    readonly property int fetchTimeoutSecs: Logic.timeoutSeconds(Plasmoid.configuration.commandTimeout)
    readonly property int minIntervalSecs: 30

    Plasmoid.icon: "speedometer"
    switchWidth: Kirigami.Units.gridUnit * 12
    switchHeight: Kirigami.Units.gridUnit * 8
    activationTogglesExpanded: true

    compactRepresentation: CompactRepresentation { applet: root }
    fullRepresentation: FullRepresentation { applet: root }

    toolTipMainText: root.entry ? root.entry.label : i18n("Z.ai Usage")
    toolTipSubText: root.tooltipBody()

    Plasmoid.contextualActions: [
        PlasmaCore.Action {
            text: i18n("Refresh now")
            icon.name: "view-refresh"
            onTriggered: root.refresh()
        },
        PlasmaCore.Action {
            text: i18n("Open Z.ai Subscription")
            icon.name: "internet-web-browser"
            onTriggered: root.openUsagePage()
        }
    ]

    function tooltipBody() {
        if (root.failure)
            return root.failure;
        if (!root.entry)
            return i18n("Loading…");
        if (root.entry.status === "error" && root.entry.error)
            return root.entry.error;
        const used = root.entry.usedPercent;
        const usedText = used === null ? "—" : Math.round(used) + i18n("% used");
        const reset = root.resetText();
        return reset ? usedText + "\n" + reset : usedText;
    }

    function resetText() {
        if (!root.entry)
            return "";
        if (root.entry.resetLabel)
            return i18n("Resets %1", root.entry.resetLabel);
        const label = Logic.formatResetAbsolute(root.entry.resetAt);
        return label ? i18n("Resets %1", label) : "";
    }

    function updatedText() {
        if (!root.entry || !root.entry.fetchedAt)
            return "";
        const at = Date.parse(root.entry.fetchedAt);
        if (!Number.isFinite(at))
            return "";
        const ms = root.nowMs - at;
        const base = ms < 60000 ? i18n("Updated just now")
                                : i18n("Updated %1 ago", Logic.formatDuration(ms));
        return root.pendingCommand !== "" ? base + i18n(" · refreshing…") : base;
    }

    function statusMessage() {
        if (root.failure)
            return root.failure;
        if (root.entry && root.entry.status === "error" && root.entry.error)
            return root.entry.error;
        if (root.entry && root.entry.stale)
            return root.entry.error
                ? i18n("Showing cached usage.") + "\n" + root.entry.error
                : i18n("Showing cached usage.");
        return "";
    }

    function statusIsUrgent() {
        if (root.failure)
            return true;
        return !!root.entry && root.entry.status === "error";
    }

    Plasma5Support.DataSource {
        id: reader
        engine: "executable"
        connectedSources: []

        onNewData: (sourceName, data) => {
            disconnectSource(sourceName);
            if (sourceName !== root.pendingCommand)
                return;
            root.pendingCommand = "";
            watchdog.stop();
            root.consume(data);
        }

        function exec(cmd) {
            if (connectedSources.indexOf(cmd) === -1)
                connectSource(cmd);
        }
    }

    Plasma5Support.DataSource {
        id: launcher
        engine: "executable"
        connectedSources: []
        onNewData: sourceName => disconnectSource(sourceName)
        function exec(cmd) {
            if (connectedSources.indexOf(cmd) === -1)
                connectSource(cmd);
        }
    }

    function currentCommand() {
        const bundled = Logic.fileUrlToPath(Qt.resolvedUrl("../code/zai-usage-kde-widget"));
        const bin = Logic.resolveBinary(Plasmoid.configuration.binaryPath, bundled, "zai-usage-kde-widget");
        return Logic.buildCommand(bin, root.fetchTimeoutSecs, "zai-usage-kde-widget");
    }

    function refresh() {
        const cmd = root.currentCommand();
        if (root.pendingCommand === cmd)
            return;
        root.pendingCommand = cmd;
        watchdog.restart();
        reader.exec(cmd);
    }

    Timer {
        id: watchdog
        interval: (root.fetchTimeoutSecs + Logic.TIMEOUT_KILL_GRACE_SECS + 5) * 1000
        repeat: false
        onTriggered: {
            if (root.pendingCommand === "")
                return;
            reader.disconnectSource(root.pendingCommand);
            root.pendingCommand = "";
            root.failure = i18n("Z.ai usage took too long (>%1s)", root.fetchTimeoutSecs);
        }
    }

    function consume(data) {
        const exitCode = data["exit code"];
        const stdout = data["stdout"] || "";
        const stderr = data["stderr"] || "";

        if (exitCode === Logic.EXIT_TIMED_OUT || exitCode === Logic.EXIT_KILLED) {
            root.failure = i18n("Z.ai usage took too long (>%1s)", root.fetchTimeoutSecs);
            return;
        }

        const parsed = Logic.parseReport(stdout);
        if (!parsed.ok) {
            const headline = exitCode !== 0
                ? (stderr.trim() ? i18n("Could not fetch Z.ai usage")
                                 : i18n("zai-usage-kde-widget exited with %1", exitCode))
                : i18n("invalid output");
            const detail = Logic.safeText(exitCode !== 0 ? stderr.trim() : parsed.raw, 300);
            root.failure = detail ? headline + "\n" + detail : headline;
            return;
        }

        root.failure = "";
        root.entry = parsed.entry;
    }

    function openUsagePage() {
        launcher.exec("xdg-open 'https://z.ai/manage-apikey/subscription'");
    }

    Timer {
        interval: Math.max(root.minIntervalSecs, Plasmoid.configuration.interval) * 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }

    Timer {
        interval: 30000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.nowMs = Date.now()
    }
}
