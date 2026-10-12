import { AlphaType, ColorType, Skia, SkData } from '@shopify/react-native-skia';

const DATA_URI_PREFIX = /^data:[^,]*;base64,/i;
const REMOTE_OR_FILE_URI = /^(https?:|file:|content:)/i;

async function loadArtworkData(artwork: string): Promise<SkData> {
  if (REMOTE_OR_FILE_URI.test(artwork)) return Skia.Data.fromURI(artwork);
  return Skia.Data.fromBase64(artwork.replace(DATA_URI_PREFIX, ''));
}

export async function artworkThumbnailPixels(artwork: string, size: number): Promise<Uint8Array | null> {
  const image = Skia.Image.MakeImageFromEncoded(await loadArtworkData(artwork));
  const surface = Skia.Surface.Make(size, size);
  if (!image || !surface) return null;
  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, size, size),
      Skia.Paint(),
    );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: size,
    height: size,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  return pixels instanceof Uint8Array ? pixels : null;
}
