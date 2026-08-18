import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    property alias cfg_interval: interval.value
    property alias cfg_commandTimeout: commandTimeout.value
    property alias cfg_binaryPath: binaryPath.text
    property alias cfg_showBars: showBars.checked
    property alias cfg_showPercent: showPercent.checked

    Kirigami.FormLayout {
        QQC2.SpinBox {
            id: interval
            Kirigami.FormData.label: i18n("Refresh interval (seconds):")
            from: 30
            to: 3600
            stepSize: 30
        }
        QQC2.SpinBox {
            id: commandTimeout
            Kirigami.FormData.label: i18n("Fetch timeout (seconds):")
            from: 10
            to: 120
            stepSize: 5
        }
        QQC2.TextField {
            id: binaryPath
            Kirigami.FormData.label: i18n("Fetcher path:")
            placeholderText: i18n("supergrok-usage-kde-widget (from PATH)")
        }
        QQC2.CheckBox {
            id: showPercent
            Kirigami.FormData.label: i18n("Panel:")
            text: i18n("Show percentage")
        }
        QQC2.CheckBox {
            id: showBars
            text: i18n("Show usage bar")
        }
    }
}
