# Illustration recipe

Whimsical **2D rainbow** spot illustrations for onboarding and empty state.
Shipped as compressed WebP under `assets/illustrations/` (no SVG / no native deps).

## Winning set (2026-07-13, #40)

| Step / surface | File | Subject |
|---|---|---|
| Connect Gmail | `onboarding-gmail.webp` | Friendly envelope with boarding-pass flap + muted rainbow arc |
| Connect Anthropic | `onboarding-anthropic.webp` | Glowing keyhole card over stacked day/night/sunset tickets |
| Create trip | `onboarding-trip.webp` | Vintage suitcase + folded map with destination pin + rainbow |
| Empty trips home | `empty-travel-spot.webp` | Suitcase + passport under a soft rainbow |

Thumbnails of rejected candidates live in `assets/illustrations/candidates/` (v1/v2).

### Selection notes
- Generated **two options per step**; preferred meaning + brand fit over literal Gmail-logo resemblance (v1 envelope was too close to the Gmail mark).
- Anthropic v2 (keyhole / access) reads clearer for “API key” than the robot-from-passport v1.
- Trip v1 suitcase+map matched the rainbow language better than the circular landscape badge (v2).
- All finals compressed to ~16–24 KB WebP at 768×768.

## Reproducible prompt recipe

**Tool:** Cursor `GenerateImage` (image generation model behind the tool; treat as gpt-image-class / Higgsfield-equivalent depending on environment).

**Aspect:** `1:1` (1024 source → resize to 768 for ship).

**Shared style block** (prepend to every prompt):

```text
Whimsical flat 2D spot illustration for a travel itinerary app.
Soft muted rainbow palette (coral, mint, periwinkle, butter yellow) with
visible paper grain / noise and soft gradient washes — tasteful, not neon,
not garish, not 3D, not photorealistic.
Centered composition, generous padding, cream paper ground.
No text, no logos, no watermarks, no UI chrome.
```

**Per-step subjects:**

1. **Gmail** — cheerful mail envelope with a boarding-pass flap and a soft rainbow arc behind it; small airplane accent optional.
2. **Anthropic** — glowing keyhole on a soft coral access card in front of stacked perforated travel tickets (day / night / sunset landscapes).
3. **Create trip** — vintage suitcase with destination stickers and an open folded map with a dotted path ending at a map pin; muted rainbow arc.
4. **Empty state** — hopeful suitcase and passport under a faded pastel rainbow on cream sand.

**Post-process:**

```bash
# Example with Pillow
# resize to 768², save WEBP quality=78
```

**Integration:** `require()` WebP into `OnboardingIllustration` / `TravelSpotIllustration`; entrance fade+scale via Reanimated.

## Do / don't
- Do keep rainbow muted and grainy; evaluate on-device at ~200pt.
- Don't ship 1–2 MB PNG masters in the app bundle — compress first.
- Don't add `react-native-svg` for this work; WebP needs no prebuild.
