const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serveDocumentAsset } = require('../lib/document-assets');

function request(asset) {
  const result = {};
  const response = {
    type(value) { result.type = value; },
    set(name, value) { result[name] = value; },
    sendStatus(value) { result.status = value; },
    sendFile(file, options) { result.path = path.join(options.root, file); },
  };
  serveDocumentAsset({ params: { asset } }, response);
  return result;
}

test('document assets are limited to known local browser modules and OCR dictionaries', () => {
  for (const [name, type] of [
    ['pdf.mjs', 'js'], ['pdf.worker.mjs', 'js'], ['tesseract.mjs', 'js'],
    ['ocr.worker.js', 'js'], ['tesseract-core-lstm.wasm.js', 'js'],
    ['tesseract-core-lstm.wasm', 'wasm'], ['fra.traineddata.gz', 'application/gzip'],
    ['ara.traineddata.gz', 'application/gzip'], ['eng.traineddata.gz', 'application/gzip'],
  ]) {
    const result = request(name);
    assert.equal(result.type, type);
    assert.ok(fs.existsSync(result.path), 'Missing installed asset: ' + name);
    assert.match(result['Content-Security-Policy'], /connect-src 'self'/);
  }
  assert.equal(request('package.json').status, 404);
  assert.equal(request('../.env').status, 404);
});
