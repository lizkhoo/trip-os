Pod::Spec.new do |s|
  s.name           = 'AppleVision'
  s.version        = '1.0.0'
  s.summary        = 'On-device OCR via Apple Vision (VNRecognizeTextRequest) for trip-os.'
  s.description    = 'Exposes recognizeText(uri) to JS. Images are OCRed directly; PDFs are rasterized per page with PDFKit and each page is OCRed.'
  s.author         = 'trip-os'
  s.homepage       = 'https://github.com/lizkhoo/trip-os'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'PDFKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
