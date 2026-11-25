// Reads a NFC-e from the text the user copies off the SEF/SC page. Money is integer cents.
// shortcut: format based on the standard NFC-e portal template, not yet checked against a real SC copy.

const SEF_SC_HOSTS = new Set(['sat.sef.sc.gov.br', 'hom.sat.sef.sc.gov.br']);

const clean = (s) => String(s ?? '').replace(/R\$/g, '').replace(/\s+/g, '').replace(/\./g, '');

// Unit prices may carry 3+ decimals ("18,990"): round half up to cents with integer math.
export function parseCents(s) {
  const m = /^(\d+)(?:,(\d+))?$/.exec(clean(s));
  if (!m) return null;
  const d = (m[2] ?? '').padEnd(3, '0');
  return Number(m[1]) * 100 + Number(d.slice(0, 2)) + (Number(d[2]) >= 5 ? 1 : 0);
}

export function parseQty(s) {
  const c = clean(s).replace(',', '.');
  return c && Number.isFinite(Number(c)) ? Number(c) : null;
}

// Only https links of the SEF/SC with a 44-digit key; anything else is not a SC receipt.
export function chaveFromUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || !SEF_SC_HOSTS.has(u.hostname)) return null;
  const chave = (u.searchParams.get('p') ?? '').split('|')[0];
  return /^\d{44}$/.test(chave) ? chave : null;
}

const ITEM = /(?:^|\n)[ \t]*((?:(?!\(Código)[^\n])+?)\s*\(Código:\s*([^)\s]+)\s*\)\s*Qtde\.:\s*([\d.,]+)\s*UN:\s*(\S+)\s*Vl\. Unit\.:\s*([\d.,]+)\s*Vl\. Total\s*([\d.,]+)/g;

export function parseNota(rawText, chaveLida = null) {
  const text = String(rawText).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');

  const itens = [];
  for (const m of text.matchAll(ITEM)) {
    const [, descricao, codigo, qtd, unidade, unit, total] = m;
    const item = { codigo, descricao: descricao.trim(), unidade, qtd: parseQty(qtd), valorUnit: parseCents(unit), valorTotal: parseCents(total) };
    if (item.qtd == null || item.valorUnit == null || item.valorTotal == null) throw new Error(`Não entendi os valores do item ${item.descricao}.`);
    itens.push(item);
  }
  if (!itens.length) throw new Error('Não achei os itens da nota. Copie a página inteira (Selecionar tudo) e cole de novo.');
  // A partial copy must never be saved as if it were the whole receipt.
  const declarados = /Qtd\. total de itens:\s*(\d+)/.exec(text);
  if (declarados && Number(declarados[1]) !== itens.length) {
    throw new Error(`A cópia está incompleta: a nota tem ${declarados[1]} itens e eu achei ${itens.length}. Copie a página inteira (Selecionar tudo) e cole de novo.`);
  }

  const chaveTexto = /Chave de acesso[:\s]*((?:\d[ .]*){44})/i.exec(text)?.[1].replace(/\D/g, '');
  const chave = chaveTexto || chaveLida;
  if (!chave) throw new Error('Não achei a chave de acesso. Leia o QR Code da nota antes de colar.');

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const iCnpj = lines.findIndex((l) => /CNPJ/i.test(l));
  const cnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.exec(lines[iCnpj] ?? '')?.[0];
  if (!cnpj) throw new Error('Não achei o CNPJ da loja no começo da nota. Copie a página inteira e cole de novo.');
  const nome = iCnpj > 0 ? lines[iCnpj - 1] : 'Loja sem nome';

  const em = /Emissão:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/.exec(text);
  if (!em) throw new Error('Não achei a data de emissão da nota. Copie a página inteira e cole de novo.');
  const emitidaEm = `${em[3]}-${em[2]}-${em[1]}T${em[4]}-03:00`; // Brasília, sem horário de verão desde 2019

  const pagar = /Valor a pagar R\$:?\s*([\d.,]+)/.exec(text) ?? /Valor total R\$:?\s*([\d.,]+)/.exec(text);
  const total = (pagar && parseCents(pagar[1])) ?? itens.reduce((s, i) => s + i.valorTotal, 0);

  return { chave, loja: { nome, cnpj }, emitidaEm, total, itens };
}
