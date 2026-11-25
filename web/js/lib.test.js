import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByMonth, lastMonths, removeNote, normalize, mergeNotes, monthlyTotals, priceHistory, products, toBackup, parseBackup } from './lib.js';

const K = (d) => '4226111234567800019065001000001234100001234' + d;
const loja = { nome: 'MERCADO A', cnpj: '11.111.111/0001-11' };
const nota = (d, emitidaEm, itens, total = 0) => ({ chave: K(d), loja, emitidaEm, total, itens });
const item = (descricao, valorUnit) => ({ codigo: '1', descricao, unidade: 'UN', qtd: 1, valorUnit, valorTotal: valorUnit });

test('normalize strips accents and spaces', () => {
  assert.equal(normalize('  Café  Pilão 500g'), 'CAFE PILAO 500G');
});

test('mergeNotes replaces by chave', () => {
  const a = nota('1', '2026-11-01T10:00:00-03:00', [], 100);
  const a2 = { ...a, total: 200 };
  const b = nota('2', '2026-11-20T10:00:00-03:00', [], 50);
  const out = mergeNotes([a, b], [a2]);
  assert.equal(out.length, 2);
  assert.equal(out.find((n) => n.chave === a.chave).total, 200);
  assert.equal(out[0].chave, b.chave); // newest first
});

test('monthlyTotals sums cents by month, newest first', () => {
  const out = monthlyTotals([
    nota('1', '2026-10-31T23:00:00-03:00', [], 1000),
    nota('2', '2026-11-01T08:00:00-03:00', [], 250),
    nota('3', '2026-11-15T08:00:00-03:00', [], 750),
  ]);
  assert.deepEqual(out, [{ month: '2026-11', total: 1000 }, { month: '2026-10', total: 1000 }]);
});

test('priceHistory is per store and product, oldest first', () => {
  const notes = [
    nota('2', '2026-11-20T10:00:00-03:00', [item('Café Pilão 500g', 2199)]),
    nota('1', '2026-10-01T10:00:00-03:00', [item('CAFE PILAO 500G', 1899), item('LEITE', 529)]),
    { ...nota('3', '2026-11-21T10:00:00-03:00', [item('CAFE PILAO 500G', 999)]), loja: { nome: 'B', cnpj: '22' } },
  ];
  assert.deepEqual(priceHistory(notes, loja.cnpj, 'CAFE PILAO 500G'), [
    { date: '2026-10-01T10:00:00-03:00', valorUnit: 1899 },
    { date: '2026-11-20T10:00:00-03:00', valorUnit: 2199 },
  ]);
});

test('products lists first and last price', () => {
  const notes = [
    nota('2', '2026-11-20T10:00:00-03:00', [item('CAFE', 2199)]),
    nota('1', '2026-10-01T10:00:00-03:00', [item('CAFE', 1899)]),
  ];
  const [p] = products(notes);
  assert.equal(p.descNorm, 'CAFE');
  assert.equal(p.first, 1899);
  assert.equal(p.last, 2199);
  assert.equal(p.count, 2);
});

test('backup round trip', () => {
  const n = [nota('1', '2026-11-01T10:00:00-03:00', [item('X', 1)], 1)];
  assert.deepEqual(parseBackup(toBackup(n)), n);
});

test('parseBackup rejects invalid', () => {
  for (const bad of ['{}', 'not json', JSON.stringify({ app: 'outro', v: 1, notes: [] }),
    JSON.stringify({ app: 'notinha', v: 1, notes: [{ chave: '123', itens: [] }] }),
    JSON.stringify({ app: 'notinha', v: 1, notes: [{ chave: K('1') }] })]) {
    assert.throws(() => parseBackup(bad), /Arquivo de backup inválido/);
  }
});

test('parseBackup rejects notes with malformed fields', () => {
  const good = nota('1', '2026-11-01T10:00:00-03:00', [item('X', 1)], 1);
  const bads = [{ ...good, loja: undefined }, { ...good, emitidaEm: 'ontem' }, { ...good, itens: [null] },
    { ...good, total: '10' }, { ...good, itens: [{ ...item('X', 1), valorUnit: 1.5 }] }];
  for (const b of bads) assert.throws(() => parseBackup(toBackup([b])), /Arquivo de backup inválido/);
});

test('groupByMonth groups notes by month', () => {
  const a = nota('1', '2026-11-01T10:00:00-03:00', []), b = nota('2', '2026-10-01T10:00:00-03:00', []), c = nota('3', '2026-11-09T10:00:00-03:00', []);
  const g = groupByMonth([a, b, c]);
  assert.deepEqual(g.get('2026-11'), [a, c]);
  assert.deepEqual(g.get('2026-10'), [b]);
});

test('lastMonths fills missing months with honest zeros, oldest first', () => {
  const totals = [{ month: '2026-11', total: 500 }, { month: '2026-08', total: 300 }];
  assert.deepEqual(lastMonths(totals, '2026-11', 4), [
    { month: '2026-08', total: 300 }, { month: '2026-09', total: 0 }, { month: '2026-10', total: 0 }, { month: '2026-11', total: 500 },
  ]);
  assert.deepEqual(lastMonths([], '2026-01', 2).map((m) => m.month), ['2025-12', '2026-01']);
});

test('products carries the unit of the last purchase', () => {
  const notes = [nota('1', '2026-10-01T10:00:00-03:00', [{ ...item('BANANA', 649), unidade: 'KG' }])];
  assert.equal(products(notes)[0].unidade, 'KG');
});

test('removeNote drops only that chave', () => {
  const a = nota('1', '2026-11-01T10:00:00-03:00', []), b = nota('2', '2026-11-02T10:00:00-03:00', []);
  assert.deepEqual(removeNote([a, b], a.chave), [b]);
});
