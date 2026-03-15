/**
 * Client-side image compression using Canvas API.
 * Reduces photo size from ~5MB to ~300-500KB before upload.
 * This file is browser-only — do NOT import on the server.
 */
export function compressImage(file: File, maxWidth = 1280): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.75)
      // Result: ~300–500KB instead of 5MB
    }
  })
}
