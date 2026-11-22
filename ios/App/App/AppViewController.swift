import UIKit
import Capacitor

class AppViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        if let scrollView = webView?.scrollView {
            scrollView.bouncesZoom = false
            scrollView.minimumZoomScale = 1.0
            scrollView.maximumZoomScale = 1.0
            scrollView.pinchGestureRecognizer?.isEnabled = false
        }
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CompassPlugin())
    }
}
