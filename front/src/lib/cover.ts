import type { CSSProperties } from "react";

const MAX_EDGE = 1400;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function isCoverImage(cover: string) {
  return /^(data:image\/|https?:|blob:)/i.test(cover);
}

export function coverStyle(cover: string): CSSProperties {
  if (isCoverImage(cover)) {
    return {
      backgroundImage: `url("${cover}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return { background: cover };
}

export async function fileToCoverDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Sube una imagen JPG, PNG o WEBP.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("La imagen pesa más de 8 MB. Elige una más ligera.");
  }
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    image.src = url;
  });
}
