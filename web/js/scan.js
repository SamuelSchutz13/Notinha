// QR reading with jsQR (global from vendor/jsQR.js): live camera or a photo.
let stream = null;
let raf = 0;

function decode(source, w, h) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1000 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

export async function startCamera(video, onUrl) {
  stopCamera();
  const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  // The user may have left the screen while the permission prompt was open.
  if (!video.isConnected) { s.getTracks().forEach((t) => t.stop()); return; }
  stream = s;
  video.srcObject = stream;
  await video.play();
  let last = 0;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (t - last < 180 || !video.videoWidth) return;
    last = t;
    const url = decode(video, video.videoWidth, video.videoHeight);
    if (url) { stopCamera(); onUrl(url); }
  };
  raf = requestAnimationFrame(tick);
}

export function stopCamera() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function scanImageFile(file) {
  const bmp = await createImageBitmap(file);
  try { return decode(bmp, bmp.width, bmp.height); } finally { bmp.close(); }
}
