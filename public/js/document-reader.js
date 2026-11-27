const fileInput = document.getElementById('document-file');
const statusLine = document.getElementById('document-status');
const results = document.getElementById('document-results');
const asset = name => '/api/document-assets/' + name;
const markers = /ordonnance|prescri|posologie|médicament|analyse|hémoglobine|glycémie|créatinine|cholestérol|résultat|medication|glucose|lab result|وصفة|دواء|تحليل|سكر|نتيجة|\b(?:mg|mmol|g\/l|ui\/l)\b/iu;
let operation;

function clearDocument() {
  const prior = operation;
  operation = undefined;
  prior?.cancel();
  fileInput.value = '';
  statusLine.textContent = '';
  results.replaceChildren();
}

function ensureCurrent(job) {
  if (job !== operation) throw new Error('Cancelled');
}

function pageCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

async function recognize(canvas, job) {
  ensureCurrent(job);
  if (!job.ocr) {
    const { default: library } = await import(asset('tesseract.mjs'));
    ensureCurrent(job);
    const worker = await library.createWorker(job.language, 1, {
      workerPath: asset('ocr.worker.js'),
      workerBlobURL: false,
      corePath: asset('tesseract-core-lstm.wasm.js'),
      langPath: new URL(asset(''), location.origin).href,
      cacheMethod: 'none',
    });
    if (job !== operation) {
      await worker.terminate();
      ensureCurrent(job);
    }
    job.ocr = worker;
  }
  try {
    const result = await job.ocr.recognize(canvas);
    return result.data.text;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function readImage(file, job) {
  const bitmap = await createImageBitmap(file);
  try {
    ensureCurrent(job);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = pageCanvas(bitmap.width * scale, bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return [{ text: await recognize(canvas, job), scanned: true }];
  } finally {
    bitmap.close();
  }
}

async function readPdf(file, job) {
  const library = await import(asset('pdf.mjs'));
  library.GlobalWorkerOptions.workerSrc = asset('pdf.worker.mjs');
  const data = await file.arrayBuffer();
  ensureCurrent(job);
  const loading = library.getDocument({
    data, useWasm: false, disableFontFace: true, enableXfa: false, maxImageSize: 16_000_000,
  });
  job.pdf = loading;
  const pdf = await loading.promise;
  const pages = [];
  for (let number = 1; number <= Math.min(pdf.numPages, 8); number++) {
    ensureCurrent(job);
    statusLine.textContent = 'Lecture de la page ' + number + '…';
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
    if (text) {
      pages.push({ text, page: number });
    } else {
      const native = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.8, 2200 / Math.max(native.width, native.height)) });
      const canvas = pageCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
      pages.push({ text: await recognize(canvas, job), page: number, scanned: true });
    }
    page.cleanup();
  }
  return { pages, limited: pdf.numPages > pages.length };
}

function render(pages, limited) {
  const matches = [];
  for (const section of pages) {
    section.text.split(/\r\n|\n|\r/).forEach((line, index) => {
      if (!markers.test(line)) return;
      const start = Math.max(0, line.search(markers) - 80);
      const end = start + 320;
      const excerpt = (start ? '…' : '') + line.slice(start, end) + (line.length > end ? '…' : '');
      const label = (section.page ? 'Page ' + section.page + ' · ' : '') + 'Ligne ' + (index + 1);
      matches.push(label + (section.scanned ? ' · OCR · ' : ' · ') + excerpt);
    });
  }
  const notes = [matches.length
    ? Math.min(matches.length, 40) + ' ligne(s) affichée(s) sur ' + matches.length + ' repérée(s).'
    : 'Aucune ligne repérée par les mots-clés. Vérifiez le document original.'];
  if (limited) notes.push('Seules les huit premières pages ont été lues.');
  if (pages.some(section => section.scanned)) notes.push('L’OCR peut se tromper sur les chiffres et les unités. Vérifiez-les dans l’original.');
  statusLine.textContent = notes.join(' ');
  for (const match of matches.slice(0, 40)) {
    const item = document.createElement('li');
    item.textContent = match;
    results.append(item);
  }
}

document.getElementById('document-clear').addEventListener('click', clearDocument);
window.addEventListener('pagehide', clearDocument);
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  clearDocument();
  if (!file) return;
  const extension = file.name.split('.').at(-1).toLowerCase();
  const isText = extension === 'txt';
  if (!['txt', 'pdf', 'png', 'jpg', 'jpeg'].includes(extension) || file.size > (isText ? 128 * 1024 : 8 * 1024 * 1024)) {
    statusLine.textContent = 'Choisissez un fichier TXT (128 Ko), PDF, PNG ou JPEG (8 Mo maximum).';
    return;
  }
  const job = {
    language: document.getElementById('document-language').value,
    cancel() {
      this.pdf?.destroy().catch(() => {});
      this.ocr?.terminate().catch(() => {});
      this.pdf = this.ocr = undefined;
    },
  };
  operation = job;
  statusLine.textContent = 'Lecture en cours…';
  try {
    let output;
    if (isText) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes('\0')) throw new Error('Invalid text');
      output = { pages: [{ text }] };
    } else if (extension === 'pdf') {
      output = await readPdf(file, job);
    } else {
      output = { pages: await readImage(file, job) };
    }
    ensureCurrent(job);
    render(output.pages, output.limited);
  } catch {
    if (operation === job) statusLine.textContent = 'Lecture impossible. Vérifiez que le fichier est valide, non protégé et que le navigateur peut charger le lecteur.';
  } finally {
    job.cancel();
    if (operation === job) operation = undefined;
  }
});
