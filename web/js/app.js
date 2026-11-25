import { normalize, mergeNotes, monthlyTotals, monthOf, priceHistory, products, toBackup, parseBackup } from './lib.js';
import { chaveFromUrl, parseNota } from './parse.js';
import { getAll, putMany } from './db.js';
import { startCamera, stopCamera, scanImageFile } from './scan.js';
import { priceChart } from './chart.js';

const $ = (s, root = document) => root.querySelector(s);
const view = $('#view');
let notes = [];

// Note text comes from the SEFAZ page: always escape before putting it in HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TZ = 'America/Sao_Paulo';
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (cents) => brl.format(cents / 100);
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' });
const fDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: TZ });
const fDayTime = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fMonthOnly = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const monthDate = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 15);
const monthName = (ym) => { const s = fMonth.format(monthDate(ym)); return s[0].toUpperCase() + s.slice(1); };
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const prevMonth = (ym) => { const d = monthDate(ym); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// The shelf price tag: "R$ 18,99" with small raised cents.
function tag(cents, size = '') {
  const [int, dec] = (cents / 100).toFixed(2).split('.');
  return `<span class="tag ${size}" aria-label="${money(cents)}"><span class="tag-cur" aria-hidden="true">R$</span><span class="tag-int" aria-hidden="true">${Number(int).toLocaleString('pt-BR')}</span><span class="tag-dec" aria-hidden="true">,${dec}</span></span>`;
}

function change(first, last) {
  if (first === last) return '<span class="chip">mesmo preço</span>';
  const r = (last - first) / first;
  return `<span class="chip ${r > 0 ? 'up' : 'down'}">${pct.format(r).replace('-', '−')}</span>`;
}

const productHref = (cnpj, descNorm) => `#produto/${encodeURIComponent(cnpj)}/${encodeURIComponent(descNorm)}`;

function itemsList(n) {
  return `<ul class="itens">${n.itens.map((it) => `
    <li><a href="${productHref(n.loja.cnpj, normalize(it.descricao))}">
      <span class="item-nome">${esc(it.descricao)}</span>
      <span class="item-qtd">${esc(String(it.qtd).replace('.', ','))} ${esc(it.unidade)} × ${money(it.valorUnit)}</span>
      <span class="item-total">${money(it.valorTotal)}</span>
    </a></li>`).join('')}</ul>`;
}

// ---------- Notas ----------
function renderNotas() {
  if (!notes.length) {
    view.innerHTML = `
      <section class="vazio">
        <div class="vazio-nota" aria-hidden="true"><span></span><span></span><span></span></div>
        <h1>Nenhuma nota ainda</h1>
        <p>Aponte a câmera para o QR Code impresso no rodapé da nota do mercado. Os itens entram sozinhos, sem digitar nada.</p>
        <a class="btn" href="#ler">Ler a primeira nota</a>
      </section>`;
    return;
  }
  const totals = monthlyTotals(notes);
  const now = thisMonth();
  const cur = totals.find((t) => t.month === now)?.total ?? 0;
  const prev = totals.find((t) => t.month === prevMonth(now));
  let compare = '';
  if (prev) {
    const diff = cur - prev.total;
    const name = fMonthOnly.format(monthDate(prev.month));
    compare = diff === 0 ? `Igual a ${name}.` : `${money(Math.abs(diff))} ${diff < 0 ? 'a menos' : 'a mais'} que em ${name}.`;
  }
  const byMonth = Map.groupBy(notes, (n) => monthOf(n.emitidaEm));
  view.innerHTML = `
    <section class="resumo">
      <h1>Gasto em ${esc(fMonthOnly.format(monthDate(now)))}</h1>
      ${tag(cur, 'tag-xl')}
      ${compare ? `<p class="resumo-compara">${compare}</p>` : ''}
    </section>
    ${totals.map(({ month, total }) => `
      <section class="mes">
        <h2><span>${esc(monthName(month))}</span><span class="mes-total">${money(total)}</span></h2>
        ${byMonth.get(month).map((n) => `
          <details class="nota">
            <summary>
              <span class="nota-loja">${esc(n.loja.nome)}</span>
              <span class="nota-meta">${fDayTime.format(new Date(n.emitidaEm))}, ${n.itens.length} ${n.itens.length === 1 ? 'item' : 'itens'}</span>
              <span class="nota-total">${money(n.total)}</span>
            </summary>
            ${itemsList(n)}
          </details>`).join('')}
      </section>`).join('')}`;
}

// ---------- Ler nota ----------
function renderLer() {
  view.innerHTML = `
    <section class="ler">
      <h1 class="visually-hidden">Ler nota</h1>
      <div class="visor"><video muted playsinline aria-label="Imagem da câmera"></video><div class="mira" aria-hidden="true"></div></div>
      <p class="status" role="status">Aponte para o QR Code no rodapé da nota.</p>
      <button class="btn btn-ghost" type="button" id="foto">Usar uma foto da nota</button>
      <a class="link" href="#colar">Já copiei a nota, quero colar</a>
      <input type="file" id="foto-arquivo" accept="image/*" capture="environment" hidden>
    </section>`;
  const status = $('.status', view);
  const video = $('video', view);
  const fileInput = $('#foto-arquivo', view);
  $('#foto', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = 'Procurando o QR Code na foto…';
    const url = await scanImageFile(file).catch(() => null);
    if (url) lido(url);
    else status.textContent = 'Não achei um QR Code nessa foto. Tente uma foto mais de perto, com o código inteiro e nítido.';
  };
  const visor = $('.visor', view);
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    visor.hidden = true;
    status.textContent = 'A câmera só funciona com conexão segura (https). Use uma foto da nota.';
    return;
  }
  startCamera(video, lido).catch(() => {
    visor.hidden = true;
    status.textContent = 'Não consegui abrir a câmera. Libere o acesso nas permissões do navegador ou use uma foto da nota.';
  });
}

// The QR code only gives the link: the SEFAZ page sits behind a captcha, so the user
// opens it, copies the page and pastes it back here.
function lido(url) {
  const chave = chaveFromUrl(url);
  if (!chave) {
    view.innerHTML = `
      <section class="ler erro">
        <h1>QR Code não reconhecido</h1>
        <p>Esse QR Code não é de uma nota fiscal de Santa Catarina. Por enquanto o Notinha só lê notas de SC.</p>
        <a class="btn" href="#ler" id="de-novo">Ler outro QR Code</a>
      </section>`;
    $('#de-novo', view).onclick = (ev) => { ev.preventDefault(); renderLer(); };
    return;
  }
  sessionStorage.setItem('notinha-pendente', JSON.stringify({ url, chave }));
  location.hash = '#colar';
}

function renderColar() {
  const pend = JSON.parse(sessionStorage.getItem('notinha-pendente') ?? 'null');
  const podeLer = !!navigator.clipboard?.readText;
  view.innerHTML = `
    <section class="colar">
      <h1>${pend ? 'Agora copie a nota' : 'Colar uma nota'}</h1>
      <ol class="passos">
        <li><span>${pend ? 'Abra a nota na SEFAZ e passe pela verificação de segurança.' : 'Abra a nota na SEFAZ pelo QR Code e passe pela verificação de segurança.'}</span></li>
        <li><span>Toque e segure na página, escolha <b>Selecionar tudo</b> e depois <b>Copiar</b>.</span></li>
        <li><span>Volte para o Notinha e toque em <b>Colar nota</b>.</span></li>
      </ol>
      ${pend ? `<a class="btn btn-ghost" href="${esc(pend.url)}" target="_blank" rel="noopener noreferrer">Abrir nota na SEFAZ</a>` : ''}
      ${podeLer ? '<button class="btn" type="button" id="colar">Colar nota</button>' : ''}
      <label class="caixa">
        <span>${podeLer ? 'Ou cole o texto aqui' : 'Cole o texto da nota aqui'}</span>
        <textarea rows="4" placeholder="Toque e segure para colar"></textarea>
      </label>
      <p class="status" role="status"></p>
    </section>`;
  const status = $('.status', view);
  const box = $('textarea', view);
  const tentar = (text) => {
    if (!text.trim()) return;
    try {
      salvar(parseNota(text, pend?.chave));
    } catch (e) {
      status.textContent = e.message;
    }
  };
  box.addEventListener('input', () => tentar(box.value));
  $('#colar', view)?.addEventListener('click', async () => {
    try {
      tentar(await navigator.clipboard.readText());
    } catch {
      status.textContent = 'O navegador não deixou ler a área de transferência. Toque e segure na caixa abaixo e escolha Colar.';
      box.focus();
    }
  });
}

async function salvar(nota) {
  const existed = notes.some((n) => n.chave === nota.chave);
  await putMany([nota]);
  notes = mergeNotes(notes, [nota]);
  sessionStorage.removeItem('notinha-pendente');
  history.replaceState(null, '', '#ler');
  view.innerHTML = `
    <section class="lida">
      <p class="lida-aviso" role="status">${existed ? 'Essa nota já estava salva. Nada foi duplicado.' : 'Nota salva.'}</p>
      <article class="cupom">
        <header>
          <h1>${esc(nota.loja.nome)}</h1>
          <p>CNPJ ${esc(nota.loja.cnpj)}</p>
          <p>${fDayTime.format(new Date(nota.emitidaEm))}</p>
        </header>
        ${itemsList(nota)}
        <footer><span>Total</span>${tag(nota.total, 'tag-lg')}</footer>
      </article>
      <div class="acoes">
        <a class="btn" href="#ler" id="outra">Ler outra nota</a>
        <a class="btn btn-ghost" href="#notas">Ver minhas notas</a>
      </div>
    </section>`;
  $('#outra', view).onclick = (ev) => { ev.preventDefault(); renderLer(); };
}

// ---------- Preços ----------
function renderPrecos() {
  const list = products(notes).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (!list.length) {
    view.innerHTML = `<section class="vazio"><h1>Nenhum preço ainda</h1><p>Depois que você ler algumas notas, cada produto aparece aqui com o quanto o preço mudou.</p><a class="btn" href="#ler">Ler uma nota</a></section>`;
    return;
  }
  view.innerHTML = `
    <section class="precos">
      <h1>Preços</h1>
      <label class="busca"><span class="visually-hidden">Buscar produto</span>
        <input type="search" placeholder="Buscar produto" autocomplete="off"></label>
      <ul class="produtos"></ul>
      <p class="status" role="status"></p>
    </section>`;
  const ul = $('.produtos', view);
  const draw = (q) => {
    const shown = list.filter((p) => p.descNorm.includes(normalize(q)));
    ul.innerHTML = shown.map((p) => `
      <li><a href="${productHref(p.cnpj, p.descNorm)}">
        <span class="prod-nome">${esc(p.label)}</span>
        <span class="prod-loja">${esc(p.loja)}</span>
        ${tag(p.last, 'tag-sm')}
        ${p.count > 1 ? change(p.first, p.last) : '<span class="chip">1 compra</span>'}
      </a></li>`).join('');
    $('.status', view).textContent = shown.length ? '' : 'Nenhum produto com esse nome.';
  };
  $('input', view).oninput = (e) => draw(e.target.value);
  draw('');
}

function renderProduto(cnpj, descNorm) {
  const hist = priceHistory(notes, cnpj, descNorm);
  const p = products(notes).find((x) => x.cnpj === cnpj && x.descNorm === descNorm);
  if (!hist.length || !p) {
    view.innerHTML = `<section class="vazio"><h1>Produto não encontrado</h1><a class="btn" href="#precos">Ver preços</a></section>`;
    return;
  }
  const first = hist[0], last = hist.at(-1);
  const r = (last.valorUnit - first.valorUnit) / first.valorUnit;
  const since = fDay.format(new Date(first.date));
  const resumo = hist.length === 1 ? 'Você comprou só uma vez até agora.'
    : r === 0 ? `Mesmo preço desde ${since}`
    : `${r > 0 ? 'Subiu' : 'Caiu'} ${pct.format(Math.abs(r)).replace('+', '')} desde ${since}`;
  view.innerHTML = `
    <section class="produto">
      <a class="voltar" href="#precos">Preços</a>
      <h1>${esc(p.label)}</h1>
      <p class="prod-loja">${esc(p.loja)}</p>
      <div class="produto-preco">${tag(last.valorUnit, 'tag-lg')}<p class="produto-resumo ${r > 0 ? 'up' : r < 0 ? 'down' : ''}">${resumo}</p></div>
      <figure class="grafico"></figure>
      <h2>Compras</h2>
      <ul class="compras">${[...hist].reverse().map((h) => `<li><span>${fDay.format(new Date(h.date))}</span><span>${money(h.valorUnit)}</span></li>`).join('')}</ul>
    </section>`;
  $('.grafico', view).append(priceChart(hist, money, (d) => fDay.format(new Date(d))));
}

// ---------- Backup ----------
const dialog = $('#ajustes');
const ajStatus = $('#ajustes-status');
$('#abrir-ajustes').onclick = () => { ajStatus.textContent = ''; dialog.showModal(); };
$('#exportar').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toBackup(notes)], { type: 'application/json' }));
  a.download = `notinha-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  ajStatus.textContent = `Backup com ${notes.length} ${notes.length === 1 ? 'nota' : 'notas'} baixado.`;
};
const importInput = $('#importar-arquivo');
$('#importar').onclick = () => importInput.click();
importInput.onchange = async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  try {
    const incoming = parseBackup(await file.text());
    await putMany(incoming);
    notes = mergeNotes(notes, incoming);
    ajStatus.textContent = `${incoming.length} ${incoming.length === 1 ? 'nota restaurada' : 'notas restauradas'}.`;
    route();
  } catch (e) {
    ajStatus.textContent = `${e.message}. Suas notas não foram alteradas.`;
  }
};

// ---------- Router ----------
function route() {
  stopCamera();
  const [name, ...args] = (location.hash.slice(1) || 'notas').split('/');
  document.querySelectorAll('.tabs a').forEach((a) => {
    const on = a.dataset.tab === name || (name === 'produto' && a.dataset.tab === 'precos') || (name === 'colar' && a.dataset.tab === 'ler');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (name === 'ler') renderLer();
  else if (name === 'colar') renderColar();
  else if (name === 'precos') renderPrecos();
  else if (name === 'produto') renderProduto(decodeURIComponent(args[0] ?? ''), decodeURIComponent(args[1] ?? ''));
  else renderNotas();
}

window.addEventListener('hashchange', () => { route(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
notes = mergeNotes([], await getAll());
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
