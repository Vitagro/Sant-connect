const path = require('node:path');

const modules = path.join(__dirname, '../node_modules');
const assets = new Map([
  ['pdf.mjs', ['pdfjs-dist/build/pdf.min.mjs', 'js']],
  ['pdf.worker.mjs', ['pdfjs-dist/build/pdf.worker.min.mjs', 'js']],
  ['tesseract.mjs', ['tesseract.js/dist/tesseract.esm.min.js', 'js']],
  ['ocr.worker.js', ['tesseract.js/dist/worker.min.js', 'js']],
  ['tesseract-core-lstm.wasm.js', ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'js']],
  ['tesseract-core-lstm.wasm', ['tesseract.js-core/tesseract-core-lstm.wasm', 'wasm']],
  ...['fra', 'eng', 'ara'].map(lang => [
    lang + '.traineddata.gz', ['@tesseract.js-data/' + lang + '/4.0.0_best_int/' + lang + '.traineddata.gz', 'application/gzip'],
  ]),
]);

function serveDocumentAsset(req, res) {
  const asset = assets.get(req.params.asset);
  if (!asset) return res.sendStatus(404);
  res.type(asset[1]);
  res.set('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'");
  res.sendFile(asset[0], { root: modules, maxAge: '1d', dotfiles: 'deny' });
}

module.exports = { serveDocumentAsset };
