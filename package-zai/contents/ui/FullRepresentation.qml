import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents
import "../code/logic.js" as Logic

Item {
    id: full

    required property var applet

    readonly property var entry: full.applet.entry
    readonly property string status: full.applet.statusMessage()
    readonly property int contentHeight: column.implicitHeight + Kirigami.Units.largeSpacing * 2

    implicitWidth: Kirigami.Units.gridUnit * 24
    implicitHeight: full.contentHeight
    Layout.minimumWidth: Kirigami.Units.gridUnit * 20
    Layout.preferredWidth: Kirigami.Units.gridUnit * 24
    Layout.minimumHeight: full.contentHeight
    Layout.preferredHeight: full.contentHeight
    Layout.maximumHeight: full.contentHeight

    function metricDetail(metric) {
        const bits = [];
        if (metric.value)
            bits.push(metric.value);
        const reset = Logic.formatResetAbsolute(metric.resetAt);
        if (reset)
            bits.push(i18n("resets %1", reset));
        return bits.join("  ·  ");
    }

    ColumnLayout {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Kirigami.Units.largeSpacing
        spacing: Kirigami.Units.smallSpacing

        RowLayout {
            Layout.fillWidth: true
            Kirigami.Heading {
                Layout.fillWidth: true
                level: 3
                text: i18n("Usage")
                textFormat: Text.PlainText
            }
            PlasmaComponents.ToolButton {
                icon.name: "view-refresh"
                text: i18n("Refresh")
                display: PlasmaComponents.ToolButton.IconOnly
                onClicked: full.applet.refresh()
                PlasmaComponents.ToolTip.text: i18n("Refresh now")
                PlasmaComponents.ToolTip.visible: hovered
            }
        }

        PlasmaComponents.Label {
            text: full.entry && full.entry.plan ? full.entry.plan : i18n("Z.ai Coding Plan")
            opacity: 0.7
            font: Kirigami.Theme.smallFont
            textFormat: Text.PlainText
        }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: cardColumn.implicitHeight + Kirigami.Units.largeSpacing * 2
            radius: Kirigami.Units.cornerRadius + 2
            color: Qt.rgba(Kirigami.Theme.backgroundColor.r,
                           Kirigami.Theme.backgroundColor.g,
                           Kirigami.Theme.backgroundColor.b, 0.35)
            border.width: 1
            border.color: Qt.rgba(Kirigami.Theme.textColor.r,
                                  Kirigami.Theme.textColor.g,
                                  Kirigami.Theme.textColor.b, 0.12)

            ColumnLayout {
                id: cardColumn
                anchors.fill: parent
                anchors.margins: Kirigami.Units.largeSpacing
                spacing: Kirigami.Units.smallSpacing

                RowLayout {
                    Layout.fillWidth: true
                    PlasmaComponents.Label {
                        text: {
                            if (!full.entry || full.entry.usedPercent === null)
                                return i18n("…");
                            return i18n("%1% used", Math.round(full.entry.usedPercent));
                        }
                        font.bold: true
                        textFormat: Text.PlainText
                    }
                    Item { Layout.fillWidth: true }
                    PlasmaComponents.Label {
                        visible: full.applet.resetText() !== ""
                        text: full.applet.resetText()
                        opacity: 0.7
                        font: Kirigami.Theme.smallFont
                        horizontalAlignment: Text.AlignRight
                        textFormat: Text.PlainText
                    }
                }

                SegmentedBar {
                    Layout.fillWidth: true
                    usedPercent: full.entry && full.entry.usedPercent !== null ? full.entry.usedPercent : 0
                    segments: full.entry ? full.entry.products : []
                    barHeight: Math.max(10, Math.round(Kirigami.Units.gridUnit * 0.5))
                }

                Flow {
                    Layout.fillWidth: true
                    spacing: Kirigami.Units.largeSpacing
                    visible: full.entry && full.entry.products && full.entry.products.length > 0

                    Repeater {
                        model: full.entry ? full.entry.products : []
                        Row {
                            required property var modelData
                            spacing: Kirigami.Units.smallSpacing
                            Rectangle {
                                width: 8
                                height: 8
                                radius: 4
                                anchors.verticalCenter: parent.verticalCenter
                                color: modelData.color
                            }
                            PlasmaComponents.Label {
                                text: modelData.label + " " + Math.round(modelData.percent) + "%"
                                font: Kirigami.Theme.smallFont
                                textFormat: Text.PlainText
                            }
                        }
                    }
                }

                PlasmaComponents.Label {
                    visible: full.status !== ""
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: full.status
                    color: full.applet.statusIsUrgent()
                        ? Kirigami.Theme.negativeTextColor
                        : Kirigami.Theme.neutralTextColor
                    textFormat: Text.PlainText
                }
            }
        }

        Repeater {
            model: full.entry && full.entry.metrics ? full.entry.metrics : []

            ColumnLayout {
                required property var modelData
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                RowLayout {
                    Layout.fillWidth: true
                    PlasmaComponents.Label {
                        text: modelData.label
                        opacity: 0.75
                        textFormat: Text.PlainText
                    }
                    Item { Layout.fillWidth: true }
                    PlasmaComponents.Label {
                        text: Math.round(modelData.percent) + "%"
                        opacity: 0.75
                        textFormat: Text.PlainText
                    }
                }

                UsageBar {
                    Layout.fillWidth: true
                    usedPercent: modelData.percent
                    severity: modelData.severity
                    barHeight: Math.max(8, Math.round(Kirigami.Units.gridUnit * 0.4))
                }

                PlasmaComponents.Label {
                    visible: text !== ""
                    Layout.fillWidth: true
                    text: full.metricDetail(modelData)
                    opacity: 0.55
                    font: Kirigami.Theme.smallFont
                    textFormat: Text.PlainText
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            PlasmaComponents.Label {
                Layout.fillWidth: true
                text: full.applet.updatedText()
                opacity: 0.55
                font: Kirigami.Theme.smallFont
                textFormat: Text.PlainText
            }
            PlasmaComponents.ToolButton {
                text: i18n("Open on z.ai")
                icon.name: "internet-web-browser"
                display: PlasmaComponents.ToolButton.TextBesideIcon
                onClicked: full.applet.openUsagePage()
            }
        }
    }
}
