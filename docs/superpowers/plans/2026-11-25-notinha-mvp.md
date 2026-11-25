# Notinha MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA that reads a Santa Catarina NFC-e QR code, stores the items on the phone, and shows monthly totals and per-product price history.

**Architecture:** One Go binary embeds the static PWA (`web/`) and exposes `POST /api/nota`, which fetches the SEF/SC page, parses it and returns JSON without storing anything. The PWA keeps every note in IndexedDB keyed by the 44-digit access key.

**Tech Stack:** Go 1.27 + `golang.org/x/net/html`; vanilla HTML/CSS/JS (ES modules, no build); `jsQR` vendored; `node --test` for the pure JS logic.

**Spec:** `docs/superpowers/specs/2026-11-25-notinha-design.md`

## Global Constraints

- Only hosts in the allowlist are fetched: `sat.sef.sc.gov.br`, `hom.sat.sef.sc.gov.br`. Anything else → 400.
- Server never logs or stores the note URL or its contents.
- SEFAZ fetch timeout: 10 s. Request body limit: 4 KB.
- Money is integer cents (`int64` in Go, `number` of cents in JS). Never floats for money.
- Note identity = `chave` (44 digits). Saving or importing the same chave replaces, never duplicates.
- Front end: no framework, no build step, no trackers, no third-party requests (font and icons self-hosted or system).
- UI copy in pt-BR.
- Visual design: load the `frontend-design:frontend-design` skill before Task 5 — user asked for something "esteticamente bonito".

## Review Focus

1. QR from another state or any non-NFC-e link → clear message "Por enquanto só notas de SC", nothing saved. (Task 3 test `TestRejectsForeignHost`)
2. SEFAZ slow/down → friendly error within ~10 s, nothing saved. (Task 3 test `TestUpstreamTimeout`)
3. Page layout changed so zero items parse → error, never an empty note saved. (Task 2 test `TestParseNoItemsIsError`)
4. Same note scanned twice → one note. (Task 4 test `mergeNotes replaces by chave`)
5. Importing a bad/foreign JSON file → rejected, existing data untouched. (Task 4 test `parseBackup rejects invalid`)

---

### Task 1: Go module, number parsing, access key

**Files:**
- Create: `go.mod` (module `notinha`), `internal/nfce/parse_num.go`, `internal/nfce/parse_num_test.go`, `.gitignore`
- Run `git init` in `C:\Users\samue\Documents\Notinha` first.

**Interfaces:**
- Produces: `ParseCents(s string) (int64, error)` — `"1.234,56"`→`123456`, `"10,99"`→`1099`, `"R$ 3,5"`→`350`, `""`→error.
- Produces: `ParseQty(s string) (float64, error)` — `"1,234"`→`1.234`, `"2"`→`2`.
- Produces: `ChaveFromURL(raw string) (string, error)` — first 44 digits of the `p` query param (before the first `|`); error if not 44 digits.

- [ ] Step 1: Write table tests for the three functions with the values above, plus `ChaveFromURL("https://sat.sef.sc.gov.br/nfce/consulta?p=42261112345678000190650010000012341000012345|2|1|1|ABC")` → `"42261112345678000190650010000012341000012345"` and `p=123|2` → error.
- [ ] Step 2: `go test ./...` → FAIL (undefined).
- [ ] Step 3: Implement. Strip `R$`, spaces and `.`; replace `,` with `.`; cents via string split, not float multiply.
- [ ] Step 4: `go test ./...` → PASS.
- [ ] Step 5: Commit `feat: parse pt-BR numbers and NFC-e access key`.

### Task 2: SC page parser

**Files:**
- Create: `internal/nfce/nota.go`, `internal/nfce/sc.go`, `internal/nfce/sc_test.go`, `internal/nfce/testdata/sc_exemplo.html`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces:
```go
type Item struct { Codigo, Descricao, Unidade string; Qtd float64; ValorUnit, ValorTotal int64 }
type Loja struct { Nome, CNPJ string }
type Nota struct { Chave string; Loja Loja; EmitidaEm time.Time; Total int64; Itens []Item }
var ErrSemItens = errors.New("nenhum item encontrado na página")
func ParseSC(r io.Reader, chave string) (Nota, error)
```

Fixture: hand-written in the standard NFC-e portal template (`table#tabResult` rows with `span.txtTit`, `span.RCod`, `span.Rqtd`, `span.RUN`, `span.RvlUnit`, `span.valor`; `div.txtTopo` store name; first `div.text` with "CNPJ:"; `span.totalNumb.txtMax` total; "Emissão: dd/mm/yyyy hh:mm:ss" inside `#infos`). **Provisional**: Task 6 replaces it with a real SC page and adjusts selectors.

- [ ] Step 1: Tests: `TestParseSC` on the fixture with 3 items asserts loja nome/CNPJ, `Total`, `EmitidaEm` (America/Sao_Paulo), item 0 `{Descricao:"CAFE PILAO 500G", Qtd:1, Unidade:"UN", ValorUnit:1899, ValorTotal:1899}`; `TestParseNoItemsIsError` on `<html><body></body></html>` → `errors.Is(err, ErrSemItens)`.
- [ ] Step 2: `go test ./...` → FAIL.
- [ ] Step 3: Implement with `golang.org/x/net/html` tree walk; strip labels like `Código:`, `Qtde.:`, `UN:`, `Vl. Unit.:` and trim.
- [ ] Step 4: `go test ./...` → PASS.
- [ ] Step 5: Commit `feat: parse SC NFC-e page`.

### Task 3: HTTP server

**Files:**
- Create: `main.go`, `server.go`, `server_test.go`, `web/index.html` (placeholder "Notinha" so embed compiles)

**Interfaces:**
- Consumes: `ChaveFromURL`, `ParseSC`, `Nota`.
- Produces: `func newServer(fetch *http.Client, allowed map[string]bool) http.Handler`
  - `GET /` → embedded `web/` (`//go:embed web`).
  - `POST /api/nota` body `{"url": string}` → 200 `Nota` as JSON (lowerCamel field tags: `chave, loja{nome,cnpj}, emitidaEm, total, itens[{codigo,descricao,unidade,qtd,valorUnit,valorTotal}]`).
  - Errors → JSON `{"erro": string}`: 400 bad body / not https / host not allowed ("Por enquanto só notas de SC") / bad chave; 422 `ErrSemItens` ("Não consegui ler os itens desta nota"); 502 upstream error or timeout ("A SEFAZ não respondeu, tente de novo").
- `main.go`: `PORT` env (default `8080`), client timeout 10 s, allowlist from Global Constraints. No request logging.

- [ ] Step 1: Tests with `httptest`: fake upstream serving the Task 2 fixture; allowlist containing the fake's host (use the https test server + its client). `TestNotaOK` (200, 3 itens), `TestRejectsForeignHost` (`https://evil.example/...` → 400, upstream never hit), `TestUpstreamTimeout` (client timeout 50 ms, upstream sleeps 200 ms → 502), `TestEmptyPage` (→ 422), `TestServesIndex` (GET / → 200 contains "Notinha").
- [ ] Step 2: `go test ./...` → FAIL.
- [ ] Step 3: Implement; `http.MaxBytesReader` 4096; check `u.Scheme=="https"` and `allowed[u.Hostname()]`.
- [ ] Step 4: `go test ./...` → PASS; `go run .` then `curl -s localhost:8080` shows the placeholder.
- [ ] Step 5: Commit `feat: stateless NFC-e API server`.

### Task 4: Pure JS logic

**Files:**
- Create: `web/js/lib.js`, `web/js/lib.test.js`

**Interfaces:**
- Produces (ES module exports, all pure):
  - `normalize(desc: string): string` — uppercase, no accents (NFD + strip marks), collapse spaces, trim.
  - `mergeNotes(existing: Nota[], incoming: Nota[]): Nota[]` — by `chave`, incoming wins, sorted by `emitidaEm` desc.
  - `monthlyTotals(notes: Nota[]): {month: "YYYY-MM", total: number}[]` — cents, newest month first.
  - `priceHistory(notes: Nota[], cnpj: string, descNorm: string): {date: string, valorUnit: number}[]` — oldest first.
  - `products(notes: Nota[]): {cnpj, loja, descNorm, label, last: number, first: number, count}[]` — for the product list.
  - `toBackup(notes): string` → JSON `{app:"notinha", v:1, notes}`; `parseBackup(text): Nota[]` throws `Error("Arquivo de backup inválido")` unless `app==="notinha"`, `v===1`, `notes` is an array whose items all have a 44-digit `chave` and `itens` array.

- [ ] Step 1: `node:test` tests: `normalize("  Café  Pilão 500g")==="CAFE PILAO 500G"`; `mergeNotes replaces by chave` (same chave twice → length 1, newer content kept); `monthlyTotals` over notes in 2026-10 and 2026-11; `priceHistory` ordering; `parseBackup rejects invalid` (`"{}"`, `"not json"`, wrong `app`, chave of 10 digits — all throw); round trip `parseBackup(toBackup(n))` deep-equals `n`.
- [ ] Step 2: `node --test web/js/` → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `node --test web/js/` → PASS.
- [ ] Step 5: Commit `feat: note merging, totals and price history`.

### Task 5: PWA screens

Load `frontend-design:frontend-design` first. Direction: warm, paper-receipt feel (off-white paper, ink-dark text, monospace numerals for prices, a torn-receipt edge motif), dark theme variant, mobile-first, big thumb-reachable scan button. Respect `prefers-reduced-motion` and `prefers-color-scheme`; all controls labelled for screen readers.

**Files:**
- Create: `web/index.html`, `web/css/app.css`, `web/js/app.js` (routing between 3 views via `#ler`, `#notas`, `#produto/<cnpj>/<descNorm>`), `web/js/db.js`, `web/js/scan.js`, `web/js/chart.js`, `web/vendor/jsQR.js` (vendored from the `jsqr` npm package dist, license header kept), `web/manifest.webmanifest`, `web/sw.js`, `web/icon.svg`

**Interfaces:**
- Consumes: Task 3 API, Task 4 exports.
- Produces:
  - `db.js`: `getAll(): Promise<Nota[]>`, `putMany(notes: Nota[]): Promise<void>` (DB `notinha`, store `notas`, keyPath `chave`).
  - `scan.js`: `startCamera(video, onUrl)`, `stopCamera()`, `scanImageFile(file): Promise<string|null>` — both use jsQR on a canvas.
  - `chart.js`: `priceChart(points): SVGElement` — line + dots, min/max labels, scales to container; empty state for 1 point.
- Views:
  - **Ler nota**: camera viewport + "Usar foto" fallback; on success POST `/api/nota`, show the parsed receipt (store, date, items, total) and save it. Errors from the API shown verbatim.
  - **Notas**: current month total big at top, monthly totals list, notes grouped by month; tapping a note expands its items; tapping an item opens its Produto view.
  - **Produto**: label, store, chart from `priceHistory`, change % first→last.
  - Settings sheet: "Exportar backup" (download `notinha-backup-YYYY-MM-DD.json`), "Importar backup" (file input → `parseBackup` → `mergeNotes` → `putMany`; on error show message, change nothing).
- `sw.js`: cache-first for static files, network-only for `/api/`.

- [ ] Step 1: Build the views.
- [ ] Step 2: Verify with `go run .` and a browser at `http://localhost:8080`: the camera prompt appears; "Usar foto" with a QR image containing a test URL pointing at the fake upstream is not possible locally, so add a dev-only flag `NOTINHA_DEV_FIXTURE=1` that makes `/api/nota` return the Task 2 fixture parse for any allowed-host URL. With it: scan a printed/onscreen QR of `https://sat.sef.sc.gov.br/nfce/consulta?p=<44 digits>|2|1|1|X` → receipt shows and appears in Notas; scanning again keeps one note; export then import → still one note; import `{}` → error shown, data intact.
- [ ] Step 3: Screenshot light and dark themes at 390×844 and fix what looks off.
- [ ] Step 4: Commit `feat: PWA screens`.

### Task 6: Real SC page (needs a real QR link from the user)

**Files:**
- Modify: `internal/nfce/testdata/` (add `sc_real.html`, CPF/name redacted), `internal/nfce/sc.go`, `internal/nfce/sc_test.go`; Global Constraints allowlist if the production host differs.

- [ ] Step 1: Fetch the real page once with `curl`; if it needs a captcha or JS rendering, STOP and report to the user — approach A must be revisited.
- [ ] Step 2: Save it as fixture, redacting any personal data; add `TestParseSCReal` asserting its real item count and total.
- [ ] Step 3: Adjust selectors until both fixture tests pass; `go test ./...` → PASS.
- [ ] Step 4: Commit `fix: match real SC NFC-e layout`.
