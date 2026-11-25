import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { qrModules, consultaUrl } from './qr.js';

const jsQR = createRequire(import.meta.url)('../vendor/jsQR.js');
const CHAVE = '42261112345678000190650010000012341000012345';

test('consultaUrl points at the SEF/SC consultation for the key', () => {
  assert.equal(consultaUrl(CHAVE), `https://sat.sef.sc.gov.br/nfce/consulta?p=${CHAVE}|2|1`);
});

test('qrModules encodes a QR that jsQR reads back', () => {
  const { size, dark } = qrModules(consultaUrl(CHAVE));
  const scale = 4, quiet = 4, px = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) {
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + quiet) * scale + y) * px + (c + quiet) * scale + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  assert.equal(jsQR(data, px, px)?.data, consultaUrl(CHAVE));
});
