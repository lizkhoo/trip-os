import ExpoModulesCore
import Vision
import PDFKit
import UIKit
import CoreGraphics

// PDFs render at 2x the page size; balances OCR fidelity against memory on multi-page docs.
private let pdfRasterScale: CGFloat = 2.0

private struct OcrBlock {
  let text: String
  let x: Double
  let y: Double
  let w: Double
  let h: Double
}

private struct OcrPage {
  let text: String
  let blocks: [OcrBlock]
}

private enum AppleVisionError: Error, LocalizedError {
  case fileNotFound(String)
  case unsupportedScheme(String)
  case imageDecodeFailed
  case pdfDecodeFailed
  case pdfHasNoPages
  case ocrFailed(String)

  var errorDescription: String? {
    switch self {
    case .fileNotFound(let uri): return "AppleVision: file not found at \(uri)"
    case .unsupportedScheme(let s): return "AppleVision: unsupported URI scheme \(s)"
    case .imageDecodeFailed: return "AppleVision: failed to decode image"
    case .pdfDecodeFailed: return "AppleVision: failed to open PDF"
    case .pdfHasNoPages: return "AppleVision: PDF has no pages"
    case .ocrFailed(let m): return "AppleVision: OCR failed (\(m))"
    }
  }
}

public class AppleVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleVision")

    AsyncFunction("recognizeText") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let url = try resolveUrl(uri)
          let pages = try runOcr(on: url)
          // Join page text with form-feed separators so downstream consumers can split if needed,
          // but Claude is happy treating it as one blob.
          let combinedText = pages.map { $0.text }.joined(separator: "\n\n")
          let blocksOut: [[String: Any]] = pages.flatMap { page in
            page.blocks.map { b in
              [
                "text": b.text,
                "bbox": ["x": b.x, "y": b.y, "w": b.w, "h": b.h],
              ]
            }
          }
          promise.resolve(["text": combinedText, "blocks": blocksOut])
        } catch {
          promise.reject("ERR_APPLE_VISION", error.localizedDescription)
        }
      }
    }
  }
}

private func resolveUrl(_ uri: String) throws -> URL {
  if uri.hasPrefix("file://") {
    guard let u = URL(string: uri) else { throw AppleVisionError.fileNotFound(uri) }
    return u
  }
  if uri.hasPrefix("/") {
    return URL(fileURLWithPath: uri)
  }
  if uri.hasPrefix("ph://") || uri.hasPrefix("assets-library://") {
    // expo-image-picker copies to a file:// path by default; if a Photos URL ever
    // reaches here it means the caller forgot to copy first.
    throw AppleVisionError.unsupportedScheme("Photos URIs must be copied to disk first")
  }
  if let u = URL(string: uri), u.isFileURL { return u }
  throw AppleVisionError.unsupportedScheme(uri)
}

private func runOcr(on url: URL) throws -> [OcrPage] {
  let ext = url.pathExtension.lowercased()
  if ext == "pdf" {
    return try ocrPdf(at: url)
  }
  guard let image = UIImage(contentsOfFile: url.path), let cg = image.cgImage else {
    throw AppleVisionError.imageDecodeFailed
  }
  let page = try ocrCgImage(cg)
  return [page]
}

private func ocrPdf(at url: URL) throws -> [OcrPage] {
  guard let doc = PDFDocument(url: url) else { throw AppleVisionError.pdfDecodeFailed }
  if doc.pageCount == 0 { throw AppleVisionError.pdfHasNoPages }
  var pages: [OcrPage] = []
  pages.reserveCapacity(doc.pageCount)
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let size = CGSize(width: bounds.width * pdfRasterScale, height: bounds.height * pdfRasterScale)
    // PDFPage.thumbnail is convenient but loses fidelity at low scale; explicit draw keeps text crisp.
    let renderer = UIGraphicsImageRenderer(size: size)
    let img = renderer.image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      let cgCtx = ctx.cgContext
      cgCtx.saveGState()
      cgCtx.translateBy(x: 0, y: size.height)
      cgCtx.scaleBy(x: pdfRasterScale, y: -pdfRasterScale)
      page.draw(with: .mediaBox, to: cgCtx)
      cgCtx.restoreGState()
    }
    guard let cg = img.cgImage else { continue }
    let p = try ocrCgImage(cg)
    pages.append(p)
  }
  if pages.isEmpty { throw AppleVisionError.pdfHasNoPages }
  return pages
}

private func ocrCgImage(_ cg: CGImage) throws -> OcrPage {
  var resultPage: OcrPage = OcrPage(text: "", blocks: [])
  var ocrError: Error?
  let request = VNRecognizeTextRequest { req, err in
    if let err = err {
      ocrError = err
      return
    }
    guard let observations = req.results as? [VNRecognizedTextObservation] else {
      resultPage = OcrPage(text: "", blocks: [])
      return
    }
    var lines: [String] = []
    var blocks: [OcrBlock] = []
    lines.reserveCapacity(observations.count)
    blocks.reserveCapacity(observations.count)
    for obs in observations {
      guard let candidate = obs.topCandidates(1).first else { continue }
      lines.append(candidate.string)
      // Vision returns bbox in normalised image coords with origin bottom-left.
      // Flip y so callers get top-left origin (matches the way image tools expect it).
      let bb = obs.boundingBox
      let flippedY = 1.0 - (bb.origin.y + bb.size.height)
      blocks.append(OcrBlock(
        text: candidate.string,
        x: Double(bb.origin.x),
        y: Double(flippedY),
        w: Double(bb.size.width),
        h: Double(bb.size.height)
      ))
    }
    resultPage = OcrPage(text: lines.joined(separator: "\n"), blocks: blocks)
  }
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do {
    try handler.perform([request])
  } catch {
    throw AppleVisionError.ocrFailed(error.localizedDescription)
  }
  if let e = ocrError {
    throw AppleVisionError.ocrFailed(e.localizedDescription)
  }
  return resultPage
}
