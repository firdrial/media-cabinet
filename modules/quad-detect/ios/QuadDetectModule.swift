import ExpoModulesCore
import Vision

public class QuadDetectModule: Module {
  public func definition() -> ModuleDefinition {
    Name("QuadDetect")

    AsyncFunction("detectQuad") { (uri: String, promise: Promise) in
      let path = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
      guard FileManager.default.fileExists(atPath: path),
            let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
            let image = CIImage(data: data) else {
        promise.resolve(nil)
        return
      }

      let request = VNDetectRectanglesRequest()
      request.maximumObservations = 1
      request.minimumAspectRatio = 0.1
      request.maximumAspectRatio = 10.0
      request.minimumSize = 0.1
      request.minimumConfidence = 0.5
      request.minimumAngle = 0.35 // ~20° off 90° allowed

      let handler = VNImageRequestHandler(ciImage: image, options: [:])
      do {
        try handler.perform([request])
        guard let r = request.results?.first else {
          promise.resolve(nil)
          return
        }

        let w = image.extent.width
        let h = image.extent.height
        // Vision origin is bottom-left; our app uses top-left. Flip y.
        let tl = r.topLeft
        let tr = r.topRight
        let br = r.bottomRight
        let bl = r.bottomLeft
        promise.resolve([
          ["x": Double(tl.x * w), "y": Double((1.0 - tl.y) * h)],
          ["x": Double(tr.x * w), "y": Double((1.0 - tr.y) * h)],
          ["x": Double(br.x * w), "y": Double((1.0 - br.y) * h)],
          ["x": Double(bl.x * w), "y": Double((1.0 - bl.y) * h)]
        ])
      } catch {
        promise.resolve(nil)
      }
    }
  }
}