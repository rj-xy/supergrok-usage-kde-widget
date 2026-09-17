import QtQuick
import org.kde.kirigami as Kirigami

Item {
    id: root

    property var segments: []
    property real usedPercent: 0
    property color trackColor: Qt.rgba(1, 1, 1, 0.12)
    property int barHeight: Math.max(8, Math.round(Kirigami.Units.gridUnit * 0.45))

    implicitHeight: root.barHeight
    implicitWidth: Kirigami.Units.gridUnit * 16

    Rectangle {
        id: track
        anchors.fill: parent
        radius: height / 2
        color: root.trackColor
        clip: true

        Row {
            id: fill
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: Math.round(parent.width * Math.max(0, Math.min(100, root.usedPercent)) / 100)
            spacing: 0

            readonly property var pixelWidths: {
                const segs = root.segments || [];
                const total = fill.width;
                if (!segs.length || total <= 0)
                    return [];
                const used = Math.max(root.usedPercent, 0.0001);
                const raw = [];
                let i;
                for (i = 0; i < segs.length; i++)
                    raw.push(total * Math.max(0, Number(segs[i].percent) || 0) / used);
                const widths = [];
                let leftover = total;
                for (i = 0; i < raw.length; i++) {
                    widths.push(Math.floor(raw[i]));
                    leftover -= widths[i];
                }
                // Largest remainder so the chips sum to the used width.
                const order = [];
                for (i = 0; i < raw.length; i++)
                    order.push(i);
                order.sort(function (a, b) {
                    return (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a]));
                });
                for (i = 0; i < leftover; i++)
                    widths[order[i % order.length]] += 1;
                return widths;
            }

            Repeater {
                model: root.segments

                Rectangle {
                    required property var modelData
                    required property int index
                    width: (fill.pixelWidths && fill.pixelWidths[index]) || 0
                    height: fill.height
                    color: modelData.color || "#4C8DFF"
                    // First and last filled chips inherit the track radius so
                    // a single-product bar still looks pill-shaped.
                    topLeftRadius: index === 0 ? track.radius : 0
                    bottomLeftRadius: index === 0 ? track.radius : 0
                    topRightRadius: index === root.segments.length - 1 ? track.radius : 0
                    bottomRightRadius: index === root.segments.length - 1 ? track.radius : 0
                }
            }
        }
    }
}
