import ExpoModulesCore
import Foundation
import CoreGraphics
import ImageIO
import Vision

public final class FashionVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FashionVision")
    // Expo's AsyncFunction queue keeps decoding and Vision work off the UI thread.
    AsyncFunction("analyze") { (uri: String, sampleSide: Int) -> [String: Any] in
      try autoreleasepool {
        try FashionImageAnalysis.analyze(uri: uri, sampleSide: sampleSide)
      }
    }
  }
}

private enum FashionImageAnalysis {
  private static let maxBytes = 10 * 1024 * 1024
  private static let joints: [(String, VNHumanBodyPoseObservation.JointName)] = [
    ("nose", .nose), ("leftShoulder", .leftShoulder), ("rightShoulder", .rightShoulder),
    ("leftHip", .leftHip), ("rightHip", .rightHip), ("leftKnee", .leftKnee),
    ("rightKnee", .rightKnee), ("leftAnkle", .leftAnkle), ("rightAnkle", .rightAnkle)
  ]

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "FashionVision", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  static func analyze(uri: String, sampleSide: Int) throws -> [String: Any] {
    guard sampleSide == 320 || sampleSide == 512 else {
      throw failure("The analysis sample size must be 320 or 512.")
    }
    let data = try readLocalImage(uri: uri)
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions),
          CGImageSourceGetCount(source) > 0,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, sourceOptions) as? [CFString: Any],
          let rawWidth = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let rawHeight = properties[kCGImagePropertyPixelHeight] as? NSNumber else {
      throw failure("The image could not be read. Choose a JPEG, PNG, or HEIC photo.")
    }
    // Validate metadata before asking ImageIO to decode any pixels.
    let w = rawWidth.doubleValue
    let h = rawHeight.doubleValue
    guard w.isFinite, h.isFinite, w >= 3, h >= 3,
          w <= 12000, h <= 12000, w * h <= 40_000_000,
          w.rounded() == w, h.rounded() == h else {
      throw failure("Choose a photo no larger than 40 megapixels or 12000 pixels per side.")
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    guard (1...8).contains(orientation) else {
      throw failure("The image orientation is invalid.")
    }
    let swapsAxes = (5...8).contains(orientation)
    let width = Int(swapsAxes ? h : w)
    let height = Int(swapsAxes ? w : h)

    // ImageIO applies all eight EXIF orientations, including mirrored orientations.
    // Vision receives already upright pixels and must not apply EXIF a second time.
    let poseImage = try thumbnail(source: source, maxSide: min(1280, max(width, height)))
    let qualityImage = try thumbnail(source: source, maxSide: min(sampleSide, max(width, height)))
    let scale = min(1.0, Double(sampleSide) / Double(max(width, height)))
    let sampleWidth = max(1, Int((Double(width) * scale).rounded()))
    let sampleHeight = max(1, Int((Double(height) * scale).rounded()))
    let metrics = try quality(image: qualityImage, width: sampleWidth, height: sampleHeight)

    let request = VNDetectHumanBodyPoseRequest()
    // Pin the revision instead of silently changing the model with an OS update.
    request.revision = VNDetectHumanBodyPoseRequestRevision1
    try VNImageRequestHandler(cgImage: poseImage, orientation: .up, options: [:]).perform([request])
    let observations = request.results ?? []
    // For multiple people, evaluate just one whole skeleton: the most confident one.
    // Never combine joints from different people to manufacture a complete body.
    let observation = observations.max { $0.confidence < $1.confidence }
    var landmarks: [[String: Any]] = []
    if let observation {
      let points = try observation.recognizedPoints(.all)
      for (name, joint) in joints {
        guard let point = points[joint] else { continue }
        let x = Double(point.location.x)
        let y = 1.0 - Double(point.location.y)
        let confidence = Double(point.confidence)
        guard x.isFinite, y.isFinite, confidence.isFinite else { continue }
        landmarks.append(["name": name, "x": x, "y": y, "confidence": confidence])
      }
    }
    return [
      "width": width, "height": height,
      "brightness": metrics.brightness, "sharpness": metrics.sharpness,
      "landmarks": landmarks, "engine": "apple-vision"
    ]
  }

  private static func readLocalImage(uri: String) throws -> Data {
    guard let suppliedURL = URL(string: uri), suppliedURL.isFileURL,
          suppliedURL.host == nil || suppliedURL.host == "" || suppliedURL.host == "localhost",
          suppliedURL.query == nil, suppliedURL.fragment == nil else {
      throw failure("Choose a local photo in this app's storage.")
    }
    let url = suppliedURL.standardizedFileURL.resolvingSymlinksInPath()
    let manager = FileManager.default
    let roots = [
      manager.urls(for: .cachesDirectory, in: .userDomainMask).first,
      manager.urls(for: .documentDirectory, in: .userDomainMask).first,
      manager.temporaryDirectory
    ].compactMap { $0?.standardizedFileURL.resolvingSymlinksInPath() }
    guard roots.contains(where: { url.path.hasPrefix($0.path + "/") }) else {
      throw failure("Only photos in this app's cache, documents, or temporary folder can be analyzed.")
    }
    let attributes = try manager.attributesOfItem(atPath: url.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular,
          let size = attributes[.size] as? NSNumber,
          size.int64Value > 0, size.int64Value <= Int64(maxBytes) else {
      throw failure("Choose a photo smaller than 10 MiB.")
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    // Bound the actual read as well, in case the file grew after metadata inspection.
    let data = try handle.read(upToCount: maxBytes + 1) ?? Data()
    guard !data.isEmpty, data.count <= maxBytes else {
      throw failure("Choose a photo smaller than 10 MiB.")
    }
    return data
  }

  private static func thumbnail(source: CGImageSource, maxSide: Int) throws -> CGImage {
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxSide,
      kCGImageSourceShouldCacheImmediately: true
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
          image.width <= maxSide, image.height <= maxSide else {
      throw failure("The photo could not be decoded safely.")
    }
    return image
  }

  private static func quality(image: CGImage, width: Int, height: Int) throws -> (brightness: Double, sharpness: Double) {
    let count = width * height
    var rgba = [UInt8](repeating: 0, count: count * 4)
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
      throw failure("The image color space could not be created.")
    }
    let rendered = rgba.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(
        data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: colorSpace,
        bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
      ) else { return false }
      context.interpolationQuality = .high
      context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
      return true
    }
    guard rendered else { throw failure("The photo could not be sampled.") }
    // Float32 storage matches the original JavaScript Float32Array. Arithmetic
    // after loading gray values uses Double, matching JavaScript Number.
    var gray = [Float](repeating: 0, count: count)
    for i in 0..<count {
      let offset = i * 4
      let alpha = Double(rgba[offset + 3])
      let unpremultiply = alpha > 0 ? 255.0 / alpha : 0
      let r = min(255, Double(rgba[offset]) * unpremultiply)
      let g = min(255, Double(rgba[offset + 1]) * unpremultiply)
      let b = min(255, Double(rgba[offset + 2]) * unpremultiply)
      gray[i] = Float(0.299 * r + 0.587 * g + 0.114 * b)
    }
    let brightness = gray.reduce(0.0) { $0 + Double($1) } / Double(count)
    var sum = 0.0
    var sumSquares = 0.0
    var n = 0
    if width > 2 && height > 2 {
      for y in 1..<(height - 1) {
        for x in 1..<(width - 1) {
          let i = y * width + x
          let laplacian = 4 * Double(gray[i]) - Double(gray[i - 1]) - Double(gray[i + 1])
            - Double(gray[i - width]) - Double(gray[i + width])
          sum += laplacian
          sumSquares += laplacian * laplacian
          n += 1
        }
      }
    }
    let mean = n > 0 ? sum / Double(n) : 0
    let variance = n > 0 ? max(0, sumSquares / Double(n) - mean * mean) : 0
    return (brightness, variance)
  }
}
