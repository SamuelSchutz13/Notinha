// Small SVG line chart of unit price over time.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

export function priceChart(points, fmtMoney, fmtDate) {
  const W = 340, H = 200, P = { l: 10, r: 10, t: 28, b: 52 };
  const base = H - P.b + 8;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const vals = points.map((p) => p.valorUnit);
  const min = Math.min(...vals), max = Math.max(...vals);
  svg.setAttribute('aria-label', `Preço de ${fmtMoney(vals[0])} até ${fmtMoney(vals.at(-1))} em ${points.length} compras`);
  const x = (i) => points.length === 1 ? W / 2 : P.l + (i * (W - P.l - P.r)) / (points.length - 1);
  const y = (v) => max === min ? (H - P.b + P.t) / 2 : P.t + ((max - v) * (H - P.t - P.b)) / (max - min);

  svg.append(el('line', { x1: P.l, x2: W - P.r, y1: base, y2: base, class: 'chart-base' }));
  if (points.length > 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valorUnit).toFixed(1)}`).join('');
    svg.append(el('path', { d: `${d}L${x(points.length - 1)},${base}L${x(0)},${base}Z`, class: 'chart-area' }));
    svg.append(el('path', { d, class: 'chart-line' }));
  }
  points.forEach((p, i) => {
    const lastPt = i === points.length - 1;
    svg.append(el('circle', { cx: x(i), cy: y(p.valorUnit), r: lastPt ? 5 : 3.5, class: lastPt ? 'chart-dot is-last' : 'chart-dot' }));
  });

  const iMax = vals.indexOf(max), iMin = vals.lastIndexOf(min);
  const label = (i, dy) => {
    const anchor = x(i) < 50 ? 'start' : x(i) > W - 50 ? 'end' : 'middle';
    svg.append(el('text', { x: x(i), y: y(vals[i]) + dy, 'text-anchor': anchor, class: 'chart-val' }, fmtMoney(vals[i])));
  };
  label(iMax, -12);
  if (iMin !== iMax && min !== max) label(iMin, 20);
  svg.append(el('text', { x: P.l, y: H - 4, class: 'chart-date' }, fmtDate(points[0].date)));
  if (points.length > 1) svg.append(el('text', { x: W - P.r, y: H - 4, 'text-anchor': 'end', class: 'chart-date' }, fmtDate(points.at(-1).date)));
  return svg;
}
