import Foundation
import CoreLocation
import Capacitor
import UIKit

@objc(CompassPlugin)
public class CompassPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "CompassPlugin"
    public let jsName = "Compass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var locationManager: CLLocationManager?
    private var active = false
    private var lastEmitTime: CFAbsoluteTime = 0
    private let minEmitInterval: CFAbsoluteTime = 0.045
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.locationManager?.stopUpdatingHeading()
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self, self.active else { return }
                self.syncHeadingOrientation()
                self.locationManager?.startUpdatingHeading()
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIDevice.orientationDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self, self.active else { return }
                self.syncHeadingOrientation()
            }
        )
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        let manager = locationManager
        DispatchQueue.main.async {
            manager?.stopUpdatingHeading()
            manager?.delegate = nil
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": CLLocationManager.headingAvailable()
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("플러그인을 초기화할 수 없어요.")
                return
            }
            guard CLLocationManager.headingAvailable() else {
                call.reject("이 기기는 나침반 센서를 지원하지 않아요.")
                return
            }

            let manager = self.ensureManager()
            self.active = true
            self.lastEmitTime = 0
            self.syncHeadingOrientation()
            manager.startUpdatingHeading()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.active = false
            self?.locationManager?.stopUpdatingHeading()
            call.resolve()
        }
    }

    private func ensureManager() -> CLLocationManager {
        if let existing = locationManager {
            return existing
        }
        let manager = CLLocationManager()
        manager.delegate = self
        manager.headingFilter = 1.0
        locationManager = manager
        return manager
    }

    private func syncHeadingOrientation() {
        guard let manager = locationManager else { return }
        let orientation = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })?.interfaceOrientation
            ?? .portrait

        switch orientation {
        case .portrait:
            manager.headingOrientation = .portrait
        case .portraitUpsideDown:
            manager.headingOrientation = .portraitUpsideDown
        case .landscapeLeft:
            manager.headingOrientation = .landscapeLeft
        case .landscapeRight:
            manager.headingOrientation = .landscapeRight
        default:
            manager.headingOrientation = .portrait
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard active, newHeading.headingAccuracy >= 0 else { return }

        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastEmitTime >= minEmitInterval else { return }
        lastEmitTime = now

        var payload: JSObject = [
            "magneticHeading": newHeading.magneticHeading,
            "accuracy": newHeading.headingAccuracy
        ]
        if newHeading.trueHeading >= 0 {
            payload["trueHeading"] = newHeading.trueHeading
        }
        notifyListeners("heading", data: payload)
    }

    public func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        return active
    }
}
