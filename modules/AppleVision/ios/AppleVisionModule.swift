import ExpoModulesCore
import PDFKit
import Vision

/**
 * On-device OCR via Apple Vision.
 *
 * `recognizeText(uri)` accepts a file:// URI to an image (png/jpg/heic/webp/…)
 * or a PDF. Images are OCRed directly; PDFs are rasterized page-by-page with
 * PDFKit at 2x scale and each page is OCRed, with page texts concatenated in
 * order. Returns `{ text, blocks: [{ text, bbox: { x, y, width, height } }] }`
 * where bbox is Vision's normalized coordinate space (origin bottom-left,
 * values in [0, 1]).
 */
public class AppleVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleVision")

    AsyncFunction("recognizeText") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.recognize(uriString: uri)
          promise.resolve(result)
        } catch {
          promise.reject("E_APPLE_VISION", error.localizedDescription)
        }
      }
    }
  }

  private struct RecognizedBlock {
    let text: String
    let bbox: CGRect
  }

  private enum VisionError: LocalizedError {
    case badUri(String)
    case unreadable(String)
    case emptyPdf(String)

    var errorDescription: String? {
      switch self {
      case .badUri(let uri): return "AppleVision: not a readable file URI: \(uri)"
      case .unreadable(let uri): return "AppleVision: could not load image data from: \(uri)"
      case .emptyPdf(let uri): return "AppleVision: PDF has no readable pages: \(uri)"
      }
    }
  }

  private static func recognize(uriString: String) throws -> [String: Any] {
    guard let url = URL(string: uriString), url.isFileURL else {
      // Bare paths (no scheme) are still usable — treat them as file paths.
      if uriString.hasPrefix("/") {
        return try recognize(url: URL(fileURLWithPath: uriString))
      }
      throw VisionError.badUri(uriString)
    }
    return try recognize(url: url)
  }

  private static func recognize(url: URL) throws -> [String: Any] {
    let images: [CGImage]
    if url.pathExtension.lowercased() == "pdf" {
      images = try rasterizePdf(url: url)
    } else {
      images = [try loadImage(url: url)]
    }

    var pageTexts: [String] = []
    var allBlocks: [[String: Any]] = []
    for image in images {
      let blocks = try ocr(cgImage: image)
      pageTexts.append(blocks.map(\.text).joined(separator: "\n"))
      for block in blocks {
        allBlocks.append([
          "text": block.text,
          "bbox": [
            "x": block.bbox.origin.x,
            "y": block.bbox.origin.y,
            "width": block.bbox.size.width,
            "height": block.bbox.size.height,
          ],
        ])
      }
    }

    return [
      "text": pageTexts.joined(separator: "\n\n"),
      "blocks": allBlocks,
    ]
  }

  private static func loadImage(url: URL) throws -> CGImage {
    guard
      let data = try? Data(contentsOf: url),
      let image = UIImage(data: data)?.cgImage
    else {
      throw VisionError.unreadable(url.absoluteString)
    }
    return image
  }

  private static func rasterizePdf(url: URL) throws -> [CGImage] {
    guard let document = PDFDocument(url: url), document.pageCount > 0 else {
      throw VisionError.emptyPdf(url.absoluteString)
    }
    var images: [CGImage] = []
    for index in 0..<document.pageCount {
      guard let page = document.page(at: index) else { continue }
      let bounds = page.bounds(for: .mediaBox)
      // 2x scale keeps small receipt text legible for Vision without ballooning memory.
      let scale: CGFloat = 2.0
      let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
      let renderer = UIGraphicsImageRenderer(size: size)
      let image = renderer.image { ctx in
        UIColor.white.setFill()
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.cgContext.translateBy(x: 0, y: size.height)
        ctx.cgContext.scaleBy(x: scale, y: -scale)
        page.draw(with: .mediaBox, to: ctx.cgContext)
      }
      if let cgImage = image.cgImage {
        images.append(cgImage)
      }
    }
    if images.isEmpty {
      throw VisionError.emptyPdf(url.absoluteString)
    }
    return images
  }

  private static func ocr(cgImage: CGImage) throws -> [RecognizedBlock] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    // English + Japanese cover the seed itinerary; Vision falls back gracefully
    // for other Latin-script languages.
    request.recognitionLanguages = ["en-US", "ja-JP"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    guard let observations = request.results else { return [] }
    return observations.compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      return RecognizedBlock(text: candidate.string, bbox: observation.boundingBox)
    }
  }
}
