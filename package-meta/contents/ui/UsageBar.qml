import QtQuick
import org.kde.kirigami as Kirigami
import "../code/logic.js" as Logic

Item {
    id: root

    property real usedPercent: 0
    property string severity: "low"
    property int barHeight: Math.max(8, Math.round(Kirigami.Units.gridUnit * 0.45))

    implicitHeight: root.barHeight
    implicitWidth: Kirigami.Units.gridUnit * 16

    Rectangle {
        id: track
        anchors.fill: parent
        radius: height / 2
        color: Qt.rgba(1, 1, 1, 0.12)
    }

    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: Math.round(parent.width * Math.max(0, Math.min(100, root.usedPercent)) / 100)
        radius: height / 2
        color: Logic.severityColor(root.severity)
    }
}
