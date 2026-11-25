// Pure logic for Notinha. Money is always integer cents.

export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const byDateDesc = (a, b) => (a.emitidaEm < b.emitidaEm ? 1 : a.emitidaEm > b.emitidaEm ? -1 : 0);

export function mergeNotes(existing, incoming) {
  const map = new Map(existing.map((n) => [n.chave, n]));
  for (const n of incoming) map.set(n.chave, n);
  return [...map.values()].sort(byDateDesc);
}

// emitidaEm comes from the server in Brasília time ("2026-11-25T10:42:17-03:00"),
// so its first 7 chars are already the local month.
export const monthOf = (iso) => iso.slice(0, 7);

export function monthlyTotals(notes) {
  const sums = new Map();
  for (const n of notes) sums.set(monthOf(n.emitidaEm), (sums.get(monthOf(n.emitidaEm)) ?? 0) + n.total);
  return [...sums].map(([month, total]) => ({ month, total })).sort((a, b) => b.month.localeCompare(a.month));
}

export function priceHistory(notes, cnpj, descNorm) {
  const pts = [];
  for (const n of notes) {
    if (n.loja.cnpj !== cnpj) continue;
    for (const it of n.itens) if (normalize(it.descricao) === descNorm) pts.push({ date: n.emitidaEm, valorUnit: it.valorUnit });
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}

export function products(notes) {
  const map = new Map();
  for (const n of [...notes].sort((a, b) => -byDateDesc(a, b))) {
    for (const it of n.itens) {
      const descNorm = normalize(it.descricao);
      const key = n.loja.cnpj + '|' + descNorm;
      const p = map.get(key) ?? { cnpj: n.loja.cnpj, loja: n.loja.nome, descNorm, label: it.descricao, first: it.valorUnit, count: 0 };
      p.last = it.valorUnit;
      p.unidade = it.unidade;
      p.count++;
      map.set(key, p);
    }
  }
  return [...map.values()];
}

// The `count` months ending at `current` ("YYYY-MM"), oldest first; months with no notes are 0.
export function lastMonths(totals, current, count) {
  const byMonth = new Map(totals.map((t) => [t.month, t.total]));
  let y = Number(current.slice(0, 4)), m = Number(current.slice(5, 7));
  const out = [];
  for (let i = 0; i < count; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`; // taste-skill-ignore: a date, not a label
    out.unshift({ month, total: byMonth.get(month) ?? 0 });
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

const ratio = (p) => (p.last - p.first) / (p.first || 1);

// 'comprados': most bought first; 'altas' / 'quedas': only products whose price went up / down.
export function sortProducts(list, mode) {
  if (mode === 'altas') return list.filter((p) => p.last > p.first).sort((a, b) => ratio(b) - ratio(a));
  if (mode === 'quedas') return list.filter((p) => p.last < p.first).sort((a, b) => ratio(a) - ratio(b));
  return [...list].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function priceStats(hist) {
  let min = hist[0], max = hist[0], sum = 0;
  for (const h of hist) {
    if (h.valorUnit < min.valorUnit) min = h;
    if (h.valorUnit > max.valorUnit) max = h;
    sum += h.valorUnit;
  }
  return { min, max, avg: Math.round(sum / hist.length) };
}

export const removeNote =(notes, chave) => notes.filter((n) => n.chave !== chave);

export function groupByMonth(notes) {
  const map = new Map();
  for (const n of notes) {
    const m = monthOf(n.emitidaEm);
    map.set(m, [...(map.get(m) ?? []), n]);
  }
  return map;
}

export const toBackup = (notes) => JSON.stringify({ app: 'notinha', v: 1, notes });

const isStr = (v) => typeof v === 'string';
const validItem = (it) => it && isStr(it.descricao) && isStr(it.unidade) && Number.isFinite(it.qtd) &&
  Number.isInteger(it.valorUnit) && Number.isInteger(it.valorTotal);

// Everything the screens read must be present: a bad note stored once would break every load.
export const validNota = (n) => /^\d{44}$/.test(n?.chave) && isStr(n.loja?.nome) && isStr(n.loja?.cnpj) &&
  isStr(n.emitidaEm) && /^\d{4}-\d{2}-\d{2}T/.test(n.emitidaEm) && !Number.isNaN(Date.parse(n.emitidaEm)) &&
  Number.isInteger(n.total) && Array.isArray(n.itens) && n.itens.every(validItem);

export function parseBackup(text) {
  const bad = new Error('Arquivo de backup inválido');
  let data;
  try { data = JSON.parse(text); } catch { throw bad; }
  const ok = data?.app === 'notinha' && data.v === 1 && Array.isArray(data.notes) && data.notes.every(validNota);
  if (!ok) throw bad;
  return data.notes;
}
