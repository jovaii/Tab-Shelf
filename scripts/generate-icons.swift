#!/usr/bin/env swift

import AppKit
import Foundation

let sizes = [16, 32, 48, 64, 96, 128, 256, 512]

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("Usage: swift scripts/generate-icons.swift <output-directory>\n".utf8))
    exit(64)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(
    at: outputDirectory,
    withIntermediateDirectories: true,
    attributes: nil
)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(deviceRed: red / 255, green: green / 255, blue: blue / 255, alpha: alpha)
}

func roundedLine(from start: NSPoint, to end: NSPoint, width: CGFloat, color: NSColor) {
    let line = NSBezierPath()
    line.move(to: start)
    line.line(to: end)
    line.lineWidth = width
    line.lineCapStyle = .round
    color.setStroke()
    line.stroke()
}

func iconData(size: Int) throws -> Data {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw CocoaError(.fileWriteUnknown)
    }

    let dimension = CGFloat(size)
    let bounds = NSRect(x: 0, y: 0, width: dimension, height: dimension)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.shouldAntialias = true
    context.imageInterpolation = .high

    NSColor.clear.setFill()
    bounds.fill()

    let inset = max(1, dimension * 0.035)
    let tile = bounds.insetBy(dx: inset, dy: inset)
    let tilePath = NSBezierPath(
        roundedRect: tile,
        xRadius: dimension * 0.235,
        yRadius: dimension * 0.235
    )
    let tileGradient = NSGradient(
        starting: color(38, 55, 51),
        ending: color(11, 17, 20)
    )!
    tileGradient.draw(in: tilePath, angle: -52)

    let highlight = NSBezierPath(
        roundedRect: tile.insetBy(dx: dimension * 0.025, dy: dimension * 0.025),
        xRadius: dimension * 0.21,
        yRadius: dimension * 0.21
    )
    highlight.lineWidth = max(0.5, dimension * 0.012)
    color(255, 255, 255, 0.14).setStroke()
    highlight.stroke()

    let shelfColor = color(168, 224, 213)
    let shelfWidth = max(1.25, dimension * 0.075)
    roundedLine(
        from: NSPoint(x: dimension * 0.235, y: dimension * 0.65),
        to: NSPoint(x: dimension * 0.67, y: dimension * 0.65),
        width: shelfWidth,
        color: shelfColor
    )
    roundedLine(
        from: NSPoint(x: dimension * 0.285, y: dimension * 0.49),
        to: NSPoint(x: dimension * 0.72, y: dimension * 0.49),
        width: shelfWidth,
        color: shelfColor
    )
    roundedLine(
        from: NSPoint(x: dimension * 0.235, y: dimension * 0.33),
        to: NSPoint(x: dimension * 0.59, y: dimension * 0.33),
        width: shelfWidth,
        color: shelfColor
    )

    let markerDiameter = dimension * 0.19
    let marker = NSBezierPath(ovalIn: NSRect(
        x: dimension * 0.665,
        y: dimension * 0.62,
        width: markerDiameter,
        height: markerDiameter
    ))
    color(119, 222, 196).setFill()
    marker.fill()
    marker.lineWidth = max(0.75, dimension * 0.025)
    color(23, 33, 31).setStroke()
    marker.stroke()

    NSGraphicsContext.restoreGraphicsState()
    guard bitmap.pixelsWide == size,
          bitmap.pixelsHigh == size,
          let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    return data
}

for size in sizes {
    let destination = outputDirectory.appendingPathComponent("icon-\(size).png")
    try iconData(size: size).write(to: destination, options: .atomic)
}
