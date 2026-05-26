# AppleVision

Local Expo module wrapping `VNRecognizeTextRequest` (Apple Vision). Single entry point:

```ts
import { recognizeText } from '../../modules/AppleVision';

const { text, blocks } = await recognizeText('file:///.../uploads/2026/05/abc.pdf');
```

- Images (JPEG/PNG/HEIC): OCR the bitmap directly.
- PDFs: rasterise each page via PDFKit at 2× scale, OCR each page, concatenate `text` in page order, flatten `blocks` across pages. bbox stays normalised to the page image it came from.
- `recognitionLevel = .accurate`, `usesLanguageCorrection = true`.

## Setup

Because this is a native module it requires a prebuild step the first time you clone — and again any time you bump SDK or add native deps:

```bash
pnpm dlx expo prebuild --platform ios
pnpm ios
```

The generated `ios/` directory is gitignored; only the Swift sources under `modules/AppleVision/ios/` are tracked. CocoaPods discovers this pod through `expo-modules-autolinking` (driven by `expo-module.config.json`), so no manual Podfile edits are needed.

## Why local instead of a separate package

Single-user app, on-device only. Vendoring as a local module keeps the Swift source next to the TypeScript consumer and avoids a publish/version dance.
