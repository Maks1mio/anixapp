/** Resize/compress large images before base64 upload (4K wallpapers etc.) */
export async function compressImageForUpload(
  file: File,
  maxWidth = 1920,
  quality = 0.88
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= 2 * 1024 * 1024 && !/webp/i.test(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
  if (!blob) return file;

  const base = file.name.replace(/\.[^.]+$/, '') || 'background';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
