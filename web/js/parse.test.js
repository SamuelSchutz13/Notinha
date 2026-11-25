import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCents, parseQty, chaveFromUrl, parseNota } from './parse.js';

const sample = readFileSync(new URL('./testdata/sc_exemplo.txt', import.meta.url), 'utf8');
const CHAVE = '42261112345678000190650010000012341000012345';

test('parseCents reads pt-BR money as cents', () => {
  for (const [s, c] of [['1.234,56', 123456], ['10,99', 1099], ['R$ 3,5', 350], ['7', 700], ['0,05', 5]]) assert.equal(parseCents(s), c, s);
  for (const s of ['', 'abc']) assert.equal(parseCents(s), null, s);
  assert.equal(parseCents('18,990'), 1899);   // unit prices may have 3+ decimals
  assert.equal(parseCents('1,2349'), 123);
});

test('parseQty reads pt-BR quantities', () => {
  assert.equal(parseQty('1,234'), 1.234);
  assert.equal(parseQty('6'), 6);
  assert.equal(parseQty(''), null);
});

test('chaveFromUrl accepts only SEF/SC links with a 44-digit key', () => {
  assert.equal(chaveFromUrl(`https://sat.sef.sc.gov.br/nfce/consulta?p=${CHAVE}|2|1|1|ABC`), CHAVE);
  assert.equal(chaveFromUrl(`https://evil.example/nfce/consulta?p=${CHAVE}|2`), null);
  assert.equal(chaveFromUrl(`http://sat.sef.sc.gov.br/nfce/consulta?p=${CHAVE}|2`), null);
  assert.equal(chaveFromUrl('https://sat.sef.sc.gov.br/nfce/consulta?p=123|2'), null);
  assert.equal(chaveFromUrl('não é link'), null);
});

test('parseNota reads the copied page text', () => {
  const n = parseNota(sample);
  assert.equal(n.chave, CHAVE);
  assert.deepEqual(n.loja, { nome: 'SUPERMERCADO EXEMPLO LTDA', cnpj: '12.345.678/0001-90' });
  assert.equal(n.emitidaEm, '2026-11-25T10:42:17-03:00');
  assert.equal(n.total, 5874);
  assert.equal(n.itens.length, 3);
  assert.deepEqual(n.itens[0], { codigo: '7896089012453', descricao: 'CAFE PILAO 500G', unidade: 'UN', qtd: 1, valorUnit: 1899, valorTotal: 1899 });
  assert.deepEqual(n.itens[1], { codigo: '2001', descricao: 'BANANA PRATA KG', unidade: 'KG', qtd: 1.234, valorUnit: 649, valorTotal: 801 });
});

test('parseNota tolerates description and code on one line and Windows line breaks', () => {
  const t = sample.replace('CAFE PILAO 500G\n(Código', 'CAFE PILAO 500G (Código').replace(/\n/g, '\r\n');
  assert.equal(parseNota(t).itens[0].descricao, 'CAFE PILAO 500G');
});

test('parseNota uses the scanned key when the text has none', () => {
  const t = sample.replace(/Chave de acesso\n[\d ]+\n/, '');
  assert.equal(parseNota(t, CHAVE).chave, CHAVE);
  assert.throws(() => parseNota(t), /chave de acesso/);
});

test('parseNota rejects text without items', () => {
  assert.throws(() => parseNota('Olá, isto não é uma nota'), /itens/);
});

test('parseNota falls back to the sum of items when there is no total line', () => {
  assert.equal(parseNota(sample.replace(/Valor a pagar R\$:58,74\n/, '').replace(/Valor total R\$:58,74\n/, '')).total, 5874);
});

test('parseNota rejects a partial copy (item count mismatch)', () => {
  const partial = sample.replace(/BANANA PRATA KG[\s\S]*?31,74\n/, '');
  assert.throws(() => parseNota(partial), /itens/);
});

test('parseNota rejects text without the store CNPJ', () => {
  assert.throws(() => parseNota(sample.replace(/CNPJ: [^\n]+\n/, '')), /loja/);
});

test('parseNota accepts unit prices with 3 decimals', () => {
  assert.equal(parseNota(sample.replace('Vl. Unit.:   18,99', 'Vl. Unit.:   18,990')).itens[0].valorUnit, 1899);
});
