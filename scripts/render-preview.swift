#!/usr/bin/env swift

import AppKit
import Foundation
import WebKit

struct Viewport {
    let name: String
    let width: Int
    let height: Int
}

struct ShelfMetrics: Decodable {
    let cardCount: Int
    let openCount: Int
    let horizontalOverflow: Bool
    let credit: String
}

struct PreviewFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

let viewports = [
    Viewport(name: "shelf-desktop", width: 1440, height: 900),
    Viewport(name: "shelf-compact", width: 900, height: 900),
]

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(
        Data("Usage: swift scripts/render-preview.swift <local-preview-url> <output-directory>\n".utf8)
    )
    exit(64)
}

guard let previewURL = URL(string: CommandLine.arguments[1]),
      ["127.0.0.1", "localhost", "::1"].contains(previewURL.host ?? ""),
      previewURL.query?.contains("preview=1") == true else {
    FileHandle.standardError.write(Data("Preview URL must be an explicit local preview.\n".utf8))
    exit(64)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(
    at: outputDirectory,
    withIntermediateDirectories: true,
    attributes: nil
)

@MainActor
final class NavigationObserver: NSObject, WKNavigationDelegate {
    var finished = false
    var failure: Error?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finished = true
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        failure = error
        finished = true
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        failure = error
        finished = true
    }
}

@MainActor
func waitUntil(timeout: TimeInterval, condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() { return true }
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.025))
    }
    return condition()
}

@MainActor
func evaluate(_ script: String, in webView: WKWebView, timeout: TimeInterval = 10) throws -> Any? {
    var finished = false
    var result: Any?
    var failure: Error?
    webView.evaluateJavaScript(script) { value, error in
        result = value
        failure = error
        finished = true
    }
    guard waitUntil(timeout: timeout, condition: { finished }) else {
        throw CocoaError(.userCancelled)
    }
    if let failure { throw failure }
    return result
}

@MainActor
func waitForValue(
    _ expected: String,
    script: String,
    in webView: WKWebView,
    timeout: TimeInterval = 10
) -> Bool {
    waitUntil(timeout: timeout, condition: {
        (try? evaluate(script, in: webView, timeout: 1) as? String) == expected
    })
}

@MainActor
func pngData(from image: NSImage, width: Int, height: Int) throws -> Data {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw CocoaError(.fileWriteUnknown)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.imageInterpolation = .high
    image.draw(
        in: NSRect(x: 0, y: 0, width: width, height: height),
        from: .zero,
        operation: .copy,
        fraction: 1
    )
    NSGraphicsContext.restoreGraphicsState()

    guard bitmap.pixelsWide == width,
          bitmap.pixelsHigh == height,
          let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    return data
}

@MainActor
func render(viewport: Viewport) throws {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    let frame = NSRect(x: 0, y: 0, width: viewport.width, height: viewport.height)
    let webView = WKWebView(frame: frame, configuration: configuration)
    let observer = NavigationObserver()
    webView.navigationDelegate = observer
    webView.load(URLRequest(url: previewURL, cachePolicy: .reloadIgnoringLocalCacheData))

    guard waitUntil(timeout: 15, condition: { observer.finished }) else {
        throw PreviewFailure(message: "Navigation timed out for \(viewport.name)")
    }
    if let failure = observer.failure { throw failure }

    _ = try evaluate(
        "document.fonts.ready.then(() => { document.documentElement.dataset.fontsReady = 'true'; }); 'scheduled'",
        in: webView
    )
    let fontsReadyScript = "document.documentElement.getAttribute('data-fonts-ready')"
    guard waitForValue("true", script: fontsReadyScript, in: webView) else {
        throw PreviewFailure(message: "Fonts were not ready for \(viewport.name)")
    }
    let renderReadyScript = "document.documentElement.getAttribute('data-render-ready')"
    guard waitForValue("true", script: renderReadyScript, in: webView) else {
        throw PreviewFailure(message: "Shelf render marker was not ready for \(viewport.name)")
    }

    let metricsScript = """
    JSON.stringify({
      cardCount: document.querySelectorAll('.site-card').length,
      openCount: Number(document.querySelector('#open-count')?.textContent ?? '-1'),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      credit: document.querySelector('.product-credit')?.textContent ?? ''
    })
    """
    guard let metricsJSON = try evaluate(metricsScript, in: webView) as? String,
          let metricsData = metricsJSON.data(using: .utf8),
          let metrics = try? JSONDecoder().decode(ShelfMetrics.self, from: metricsData),
          metrics.cardCount == 6,
          metrics.openCount == 8,
          metrics.horizontalOverflow == false,
          metrics.credit == "Tab Shelf by James Li" else {
        throw PreviewFailure(message: "Shelf metrics did not meet acceptance for \(viewport.name)")
    }
    print("PASS viewport=\(viewport.name) stage=shelf-metrics")

    _ = try evaluate(
        "document.querySelector('[data-action=close-tab]').click(); 'clicked'",
        in: webView
    )
    guard waitForValue(
        "7",
        script: "document.querySelector('#open-count')?.textContent",
        in: webView
    ) else {
        throw PreviewFailure(message: "Closing one tab did not update the count for \(viewport.name)")
    }
    print("PASS viewport=\(viewport.name) stage=close-tab")

    _ = try evaluate("document.querySelector('#settings-button').click(); 'clicked'", in: webView)
    guard waitForValue("/settings.html", script: "location.pathname", in: webView) else {
        throw PreviewFailure(message: "Theme Studio navigation did not start for \(viewport.name)")
    }
    guard waitForValue("true", script: renderReadyScript, in: webView) else {
        let marker = (try? evaluate(renderReadyScript, in: webView) as? String) ?? "missing"
        throw PreviewFailure(message: "Theme Studio render marker was \(marker) for \(viewport.name)")
    }
    guard waitForValue(
        "Theme studio",
        script: "document.querySelector('h1')?.textContent",
        in: webView
    ) else {
        throw PreviewFailure(message: "Theme Studio heading was not available for \(viewport.name)")
    }
    print("PASS viewport=\(viewport.name) stage=open-settings")
    _ = try evaluate("document.querySelectorAll('.preset-button')[4].click(); 'clicked'", in: webView)
    guard waitForValue(
        "light",
        script: "document.documentElement.getAttribute('data-text-mode')",
        in: webView
    ) else {
        throw PreviewFailure(message: "Storm Horizon did not switch text mode for \(viewport.name)")
    }
    guard waitForValue(
        "true",
        script: "String(getComputedStyle(document.documentElement).getPropertyValue('--page-background').includes('#ff6255'))",
        in: webView
    ) else {
        throw PreviewFailure(message: "Storm Horizon did not apply its coral horizon for \(viewport.name)")
    }
    print("PASS viewport=\(viewport.name) stage=theme-switch")

    _ = try evaluate("document.querySelector('#open-shelf').click(); 'clicked'", in: webView)
    guard waitForValue("/shelf.html", script: "location.pathname", in: webView),
          waitForValue("true", script: renderReadyScript, in: webView),
          waitForValue(
              "light",
              script: "document.documentElement.getAttribute('data-text-mode')",
              in: webView
          ) else {
        throw PreviewFailure(message: "Storm Horizon shelf did not render for \(viewport.name)")
    }

    let snapshotConfiguration = WKSnapshotConfiguration()
    snapshotConfiguration.rect = frame
    snapshotConfiguration.snapshotWidth = NSNumber(value: viewport.width)
    var snapshot: NSImage?
    var snapshotFailure: Error?
    webView.takeSnapshot(with: snapshotConfiguration) { image, error in
        snapshot = image
        snapshotFailure = error
    }
    guard waitUntil(timeout: 15, condition: { snapshot != nil || snapshotFailure != nil }),
          let snapshot else {
        throw snapshotFailure ?? CocoaError(.fileWriteUnknown)
    }

    let destination = outputDirectory.appendingPathComponent("\(viewport.name).png")
    try pngData(from: snapshot, width: viewport.width, height: viewport.height)
        .write(to: destination, options: .atomic)
}

try MainActor.assumeIsolated {
    let application = NSApplication.shared
    application.setActivationPolicy(.prohibited)
    for viewport in viewports {
        try render(viewport: viewport)
    }
}
