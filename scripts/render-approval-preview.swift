#!/usr/bin/env swift

import AppKit
import Foundation
import WebKit

struct ApprovalViewport {
    let name: String
    let width: Int
    let height: Int
}

struct ApprovalPreviewFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

let viewports = [
    ApprovalViewport(name: "approval-desktop", width: 1440, height: 1100),
    ApprovalViewport(name: "approval-compact", width: 760, height: 1500),
]

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(
        Data("Usage: swift scripts/render-approval-preview.swift <local-approval-url> <output-directory>\n".utf8)
    )
    exit(64)
}

guard let approvalURL = URL(string: CommandLine.arguments[1]),
      ["127.0.0.1", "localhost", "::1"].contains(approvalURL.host ?? ""),
      approvalURL.query?.contains("approval=1") == true else {
    FileHandle.standardError.write(Data("Approval URL must be an explicit local review page.\n".utf8))
    exit(64)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(
    at: outputDirectory,
    withIntermediateDirectories: true,
    attributes: nil
)

@MainActor
final class ApprovalNavigationObserver: NSObject, WKNavigationDelegate {
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
func waitForApproval(timeout: TimeInterval, condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() { return true }
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.025))
    }
    return condition()
}

@MainActor
func evaluateApproval(
    _ script: String,
    in webView: WKWebView,
    timeout: TimeInterval = 10
) throws -> Any? {
    var finished = false
    var result: Any?
    var failure: Error?
    webView.evaluateJavaScript(script) { value, error in
        result = value
        failure = error
        finished = true
    }
    guard waitForApproval(timeout: timeout, condition: { finished }) else {
        throw CocoaError(.userCancelled)
    }
    if let failure { throw failure }
    return result
}

@MainActor
func waitForApprovalValue(
    _ expected: String,
    script: String,
    in webView: WKWebView,
    timeout: TimeInterval = 10
) -> Bool {
    waitForApproval(timeout: timeout, condition: {
        (try? evaluateApproval(script, in: webView, timeout: 1) as? String) == expected
    })
}

@MainActor
func approvalPNGData(from image: NSImage, width: Int, height: Int) throws -> Data {
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

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    return data
}

@MainActor
func fitApprovalContent(
    in webView: WKWebView,
    width: Int,
    minimumHeight: Int
) throws -> Int {
    guard let rawHeight = try evaluateApproval(
        "document.documentElement.scrollHeight",
        in: webView
    ) as? NSNumber else {
        throw ApprovalPreviewFailure(message: "Approval content height was unavailable")
    }

    let fittedHeight = max(minimumHeight, Int(ceil(rawHeight.doubleValue)))
    webView.setFrameSize(NSSize(width: width, height: fittedHeight))
    webView.layoutSubtreeIfNeeded()
    guard waitForApprovalValue(
        String(fittedHeight),
        script: "String(innerHeight)",
        in: webView
    ) else {
        throw ApprovalPreviewFailure(message: "Approval viewport did not resize to content")
    }
    return fittedHeight
}

@MainActor
func takeApprovalSnapshot(
    name: String,
    webView: WKWebView,
    frame: NSRect,
    width: Int,
    height: Int
) throws {
    let configuration = WKSnapshotConfiguration()
    configuration.rect = frame
    configuration.snapshotWidth = NSNumber(value: width)
    var snapshot: NSImage?
    var snapshotFailure: Error?
    webView.takeSnapshot(with: configuration) { image, error in
        snapshot = image
        snapshotFailure = error
    }

    guard waitForApproval(timeout: 15, condition: { snapshot != nil || snapshotFailure != nil }),
          let snapshot else {
        throw snapshotFailure ?? CocoaError(.fileWriteUnknown)
    }

    let destination = outputDirectory.appendingPathComponent("\(name).png")
    try approvalPNGData(from: snapshot, width: width, height: height)
        .write(to: destination, options: .atomic)
}

@MainActor
func renderApproval(viewport: ApprovalViewport) throws {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    let initialFrame = NSRect(x: 0, y: 0, width: viewport.width, height: viewport.height)
    let webView = WKWebView(frame: initialFrame, configuration: configuration)
    let observer = ApprovalNavigationObserver()
    webView.navigationDelegate = observer
    webView.load(URLRequest(url: approvalURL, cachePolicy: .reloadIgnoringLocalCacheData))

    guard waitForApproval(timeout: 15, condition: { observer.finished }) else {
        throw ApprovalPreviewFailure(message: "Navigation timed out for \(viewport.name)")
    }
    if let failure = observer.failure { throw failure }

    _ = try evaluateApproval(
        "document.fonts.ready.then(() => { document.documentElement.dataset.fontsReady = 'true'; }); 'scheduled'",
        in: webView
    )
    guard waitForApprovalValue(
        "true",
        script: "document.documentElement.getAttribute('data-fonts-ready')",
        in: webView
    ) else {
        throw ApprovalPreviewFailure(message: "Fonts were not ready for \(viewport.name)")
    }
    let animationsSettledScript = "String(document.getAnimations().every((animation) => animation.playState === 'finished'))"
    let finishAnimationsScript = "document.getAnimations().forEach((animation) => animation.finish()); \(animationsSettledScript)"
    guard try evaluateApproval(finishAnimationsScript, in: webView) as? String == "true" else {
        let animationDetails = (try? evaluateApproval(
            "JSON.stringify(document.getAnimations().map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime, duration: animation.effect?.getTiming().duration })))",
            in: webView
        ) as? String) ?? "unavailable"
        throw ApprovalPreviewFailure(
            message: "Mind Map animation did not settle for \(viewport.name): \(animationDetails)"
        )
    }
    let mindMapHeight = try fitApprovalContent(
        in: webView,
        width: viewport.width,
        minimumHeight: viewport.height
    )
    let mindMapFrame = NSRect(x: 0, y: 0, width: viewport.width, height: mindMapHeight)

    let mindMapChecks = """
    JSON.stringify({
      title: document.querySelector('h1')?.textContent ?? '',
      tabs: document.querySelectorAll('[role=tab]').length,
      branches: document.querySelectorAll('.map-branch').length,
      mindMapVisible: document.querySelector('#mind-map-view')?.hidden === false,
      oneSlideHidden: document.querySelector('#one-slide-view')?.hidden === true,
      animationsSettled: document.getAnimations().every((animation) => animation.playState === 'finished'),
      contentFits: document.documentElement.scrollHeight <= innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    """
    guard let mindMapJSON = try evaluateApproval(mindMapChecks, in: webView) as? String,
          mindMapJSON.contains("Drag ordering & smart categories"),
          mindMapJSON.contains("\"tabs\":2"),
          mindMapJSON.contains("\"branches\":6"),
          mindMapJSON.contains("\"mindMapVisible\":true"),
          mindMapJSON.contains("\"oneSlideHidden\":true"),
          mindMapJSON.contains("\"animationsSettled\":true"),
          mindMapJSON.contains("\"contentFits\":true"),
          mindMapJSON.contains("\"horizontalOverflow\":false") else {
        throw ApprovalPreviewFailure(message: "Mind Map contract failed for \(viewport.name)")
    }
    let mindMapGeometry = (try? evaluateApproval(
        "JSON.stringify({ scrollHeight: document.documentElement.scrollHeight, innerHeight: innerHeight, scrollX: scrollX, title: (() => { const rect = document.querySelector('h1').getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; })() })",
        in: webView
    ) as? String) ?? "unavailable"
    print("INFO viewport=\(viewport.name) view=mind-map geometry=\(mindMapGeometry)")
    print("PASS viewport=\(viewport.name) stage=mind-map")
    try takeApprovalSnapshot(
        name: "\(viewport.name)-mind-map",
        webView: webView,
        frame: mindMapFrame,
        width: viewport.width,
        height: mindMapHeight
    )

    _ = try evaluateApproval("document.querySelector('#one-slide-tab').click(); 'clicked'", in: webView)
    guard try evaluateApproval(finishAnimationsScript, in: webView) as? String == "true" else {
        let animationDetails = (try? evaluateApproval(
            "JSON.stringify(document.getAnimations().map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime, duration: animation.effect?.getTiming().duration })))",
            in: webView
        ) as? String) ?? "unavailable"
        throw ApprovalPreviewFailure(
            message: "One Slide animation did not settle for \(viewport.name): \(animationDetails)"
        )
    }
    let oneSlideHeight = try fitApprovalContent(
        in: webView,
        width: viewport.width,
        minimumHeight: viewport.height
    )
    let oneSlideFrame = NSRect(x: 0, y: 0, width: viewport.width, height: oneSlideHeight)
    let oneSlideChecks = """
    JSON.stringify({
      mindMapHidden: document.querySelector('#mind-map-view')?.hidden === true,
      oneSlideVisible: document.querySelector('#one-slide-view')?.hidden === false,
      selected: document.querySelector('#one-slide-tab')?.getAttribute('aria-selected'),
      decision: document.querySelector('.decision-label')?.textContent ?? '',
      animationsSettled: document.getAnimations().every((animation) => animation.playState === 'finished'),
      contentFits: document.documentElement.scrollHeight <= innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    """
    guard let oneSlideJSON = try evaluateApproval(oneSlideChecks, in: webView) as? String,
          oneSlideJSON.contains("\"mindMapHidden\":true"),
          oneSlideJSON.contains("\"oneSlideVisible\":true"),
          oneSlideJSON.contains("\"selected\":\"true\""),
          oneSlideJSON.contains("Decision requested"),
          oneSlideJSON.contains("\"animationsSettled\":true"),
          oneSlideJSON.contains("\"contentFits\":true"),
          oneSlideJSON.contains("\"horizontalOverflow\":false") else {
        throw ApprovalPreviewFailure(message: "One Slide contract failed for \(viewport.name)")
    }
    let oneSlideGeometry = (try? evaluateApproval(
        "JSON.stringify({ scrollHeight: document.documentElement.scrollHeight, innerHeight: innerHeight, scrollX: scrollX, title: (() => { const rect = document.querySelector('h1').getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; })() })",
        in: webView
    ) as? String) ?? "unavailable"
    print("INFO viewport=\(viewport.name) view=one-slide geometry=\(oneSlideGeometry)")
    print("PASS viewport=\(viewport.name) stage=one-slide")
    try takeApprovalSnapshot(
        name: "\(viewport.name)-one-slide",
        webView: webView,
        frame: oneSlideFrame,
        width: viewport.width,
        height: oneSlideHeight
    )
}

try MainActor.assumeIsolated {
    let application = NSApplication.shared
    application.setActivationPolicy(.prohibited)
    for viewport in viewports {
        try renderApproval(viewport: viewport)
    }
}
