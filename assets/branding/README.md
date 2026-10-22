# Compás branding

- `icon.svg` — launcher icon: the wordmark's own lowercase "c" (URW Gothic Book outline,
  unmodified) around a solid play triangle, off-white `#F3F4F6` on `#0B0C10`. 108dp adaptive
  canvas; the mark stays inside the central 66dp safe circle.
- `icon-foreground.svg` / `icon-monochrome.svg` — the adaptive foreground layer and the
  Android themed-icon layer.

The PNG/WebP launcher assets in `assets/` and `android/app/src/main/res/mipmap-*` are
rasterized from these files. The "compás" wordmark used in the app title bar and splash lives
in `src/ui/components/Wordmark.tsx` and `assets/splash/`.
