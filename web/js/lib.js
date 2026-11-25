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
      p.count++;
      map.set(key, p);
    }
  }
  return [...map.values()];
}

export const toBackup = (notes) => JSON.stringify({ app: 'notinha', v: 1, notes });

export function parseBackup(text) {
  const bad = new Error('Arquivo de backup inválido');
  let data;
  try { data = JSON.parse(text); } catch { throw bad; }
  const ok = data?.app === 'notinha' && data.v === 1 && Array.isArray(data.notes) &&
    data.notes.every((n) => /^\d{44}$/.test(n?.chave) && Array.isArray(n.itens));
  if (!ok) throw bad;
  return data.notes;
}
