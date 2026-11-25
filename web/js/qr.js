// QR code printed at the foot of each receipt, as on the real NFC-e.
import { qrcode } from '../vendor/qrcode.mjs';

// shortcut: the real QR also carries the store's hash; this one links the public consultation by key only.
export const consultaUrl = (chave) => `https://sat.sef.sc.gov.br/nfce/consulta?p=${chave}|2|1`;

export function qrModules(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}

// One SVG path, one square per dark module; crisp at any size.
export function qrSvg(text, label) {
  const { size, dark } = qrModules(text);
  let d = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg class="r-qrcode" viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges" role="img" aria-label="${label}"><path d="${d}"/></svg>`;
}
