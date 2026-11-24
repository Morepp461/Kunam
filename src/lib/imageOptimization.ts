export type ImageOptimizationPreset = "avatar" | "team-logo" | "circuit-layout" | "livery-logo";

export type OptimizedImage = {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
};

type PresetConfig = { maxDimension: number; targetBytes: number; hardLimitBytes: number };
const PRESETS: Record<ImageOptimizationPreset, PresetConfig> = {
  avatar: { maxDimension: 1440, targetBytes: 420 * 1024, hardLimitBytes: 900 * 1024 },
  "team-logo": { maxDimension: 1200, targetBytes: 260 * 1024, hardLimitBytes: 650 * 1024 },
  "circuit-layout": { maxDimension: 2400, targetBytes: 700 * 1024, hardLimitBytes: 1_500 * 1024 },
  "livery-logo": { maxDimension: 1024, targetBytes: 72 * 1024, hardLimitBytes: 100 * 1024 },
};
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const WEBP_QUALITIES = [0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5];

type DecodedImage = { source: CanvasImageSource; width: number; height: number; dispose: () => void };

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Fall through to the HTMLImageElement decoder for browser-specific formats.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("File gambar tidak dapat dibaca. Coba ekspor ulang gambarnya.");
  }
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Browser gagal mengompres gambar.")); return; }
      if (blob.type !== "image/webp") { reject(new Error("Browser ini belum mendukung ekspor WebP. Gunakan browser versi terbaru.")); return; }
      resolve(blob);
    }, "image/webp", quality);
  });
}

export async function optimizeImageToWebp(file: File, preset: ImageOptimizationPreset): Promise<OptimizedImage> {
  const supportedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const extension = file.name.split(".").pop()?.toLowerCase();
  const supportedExtensions = ["png", "jpg", "jpeg", "webp", "gif"];
  if (!supportedTypes.includes(file.type) && !(file.type === "" && supportedExtensions.includes(extension ?? ""))) {
    throw new Error("Gunakan gambar PNG, JPG, atau WebP.");
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("Ukuran file asli maksimal 15 MB.");

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_SOURCE_PIXELS) {
      throw new Error("Resolusi gambar terlalu besar. Maksimal 40 megapiksel.");
    }
    const config = PRESETS[preset];
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Browser tidak dapat memproses gambar.");
    let scale = Math.min(1, config.maxDimension / Math.max(decoded.width, decoded.height));
    let bestBlob: Blob | null = null;
    let bestWidth = 0;
    let bestHeight = 0;
    for (let resizePass = 0; resizePass < 5; resizePass += 1) {
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of WEBP_QUALITIES) {
        const blob = await canvasToWebp(canvas, quality);
        if (!bestBlob || blob.size < bestBlob.size) { bestBlob = blob; bestWidth = width; bestHeight = height; }
        if (blob.size <= config.targetBytes) {
          const optimizedFile = new File([blob], preset + ".webp", { type: "image/webp", lastModified: Date.now() });
          return { file: optimizedFile, originalSize: file.size, compressedSize: blob.size, width, height };
        }
      }
      scale *= 0.84;
    }
    if (!bestBlob || bestBlob.size > config.hardLimitBytes) {
      throw new Error("Gambar masih terlalu besar setelah kompresi. Gunakan gambar dengan resolusi lebih rendah.");
    }
    const optimizedFile = new File([bestBlob], preset + ".webp", { type: "image/webp", lastModified: Date.now() });
    return { file: optimizedFile, originalSize: file.size, compressedSize: bestBlob.size, width: bestWidth, height: bestHeight };
  } finally { decoded.dispose(); }
}

export function formatImageBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}