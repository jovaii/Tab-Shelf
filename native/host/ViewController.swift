import Cocoa
import SafariServices
import WebKit

private let extensionBundleIdentifier = "com.jovaii.tabshelf.extension"

final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    @IBOutlet private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let webView,
              let page = Bundle.main.url(forResource: "Main", withExtension: "html"),
              let resourceRoot = Bundle.main.resourceURL else { return }

        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        webView.loadFileURL(page, allowingReadAccessTo: resourceRoot)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            DispatchQueue.main.async {
                let enabled = error == nil ? state?.isEnabled : nil
                let value = enabled.map { $0 ? "true" : "false" } ?? "null"
                let usesSettingsName = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 13
                webView.evaluateJavaScript("showExtensionState(\(value), \(usesSettingsName))")
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let action = message.body as? String else { return }

        switch action {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
        case "open-privacy":
            open("https://github.com/jovaii/Tab-Shelf/blob/main/PRIVACY.md")
        case "open-support":
            open("https://github.com/jovaii/Tab-Shelf/blob/main/SUPPORT.md")
        case "open-source":
            open("https://github.com/jovaii/Tab-Shelf")
        default:
            return
        }
    }

    private func open(_ value: String) {
        guard let url = URL(string: value), url.scheme == "https" else { return }
        NSWorkspace.shared.open(url)
    }
}
