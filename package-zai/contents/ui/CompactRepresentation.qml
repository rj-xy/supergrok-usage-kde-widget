pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

MouseArea {
    id: root

    required property var applet

    acceptedButtons: Qt.LeftButton
    hoverEnabled: true

    readonly property bool vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
    readonly property bool showBar: Plasmoid.configuration.showBars
    readonly property bool showValue: Plasmoid.configuration.showPercent || !Plasmoid.configuration.showBars

    Layout.minimumWidth: root.vertical ? 0 : content.implicitWidth
    Layout.preferredWidth: root.vertical ? 0 : content.implicitWidth
    Layout.minimumHeight: root.vertical ? content.implicitHeight : 0
    Layout.preferredHeight: root.vertical ? content.implicitHeight : 0

    property bool wasExpanded: false
    onPressed: root.wasExpanded = root.applet.expanded
    onClicked: root.applet.expanded = !root.wasExpanded

    Keys.onPressed: event => {
        if (event.key === Qt.Key_Space || event.key === Qt.Key_Enter || event.key === Qt.Key_Return) {
            Plasmoid.activated();
            event.accepted = true;
        }
    }

    GridLayout {
        id: content
        anchors.centerIn: parent
        flow: root.vertical ? GridLayout.TopToBottom : GridLayout.LeftToRight
        columnSpacing: Kirigami.Units.smallSpacing
        rowSpacing: Kirigami.Units.smallSpacing

        PlasmaComponents.Label {
            text: "Z.ai"
            textFormat: Text.PlainText
            opacity: 0.75
            font: Kirigami.Theme.smallFont
        }

        PlasmaComponents.Label {
            visible: root.showValue
            text: {
                if (root.applet.failure || (root.applet.entry && root.applet.entry.status === "error"))
                    return "⚠";
                if (!root.applet.entry || root.applet.entry.usedPercent === null)
                    return "…";
                return Math.round(root.applet.entry.usedPercent) + "%";
            }
            textFormat: Text.PlainText
            color: (root.applet.failure || (root.applet.entry && root.applet.entry.status === "error"))
                ? Kirigami.Theme.negativeTextColor : Kirigami.Theme.textColor
        }

        SegmentedBar {
            visible: root.showBar
            usedPercent: root.applet.entry && root.applet.entry.usedPercent !== null
                ? root.applet.entry.usedPercent : 0
            segments: root.applet.entry ? root.applet.entry.products : []
            implicitWidth: Kirigami.Units.gridUnit * 3
            barHeight: Math.max(6, Math.round(Kirigami.Units.smallSpacing * 1.6))
            Layout.alignment: Qt.AlignVCenter
        }
    }
}
