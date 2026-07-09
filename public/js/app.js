// SantéConnect v3 — Application Logic
// All specialties | Payment | Insurance | Migration | Roadmap

let currentLang = 'fr';
let currentRole = null;
let currentSpecialty = 'generaliste';
let drugRowCount = 0;
let sigCanvas, sigCtx, signing = false, hasSig = false;

// ── LANG ──────────────────────────────────────────────────────
function setLang(l) {
  currentLang = l;
  document.documentElement.lang = l;
  document.body.dir = l === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('lang-' + l).classList.add('active');
  applyTranslations();
  rebuildDynamicLists();
}

function t(key) {
  return (LANG[currentLang] && LANG[currentLang][key]) || (LANG['fr'] && LANG['fr'][key]) || key;
}

function tArr(key) {
  return (LANG[currentLang] && LANG[currentLang][key]) || (LANG['fr'] && LANG['fr'][key]) || [];
}

function applyTranslations() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const k = el.getAttribute('data-t');
    if (t(k) !== k) el.textContent = t(k);
  });
  document.querySelectorAll('[data-t-ph]').forEach(el => {
    const v = t(el.getAttribute('data-t-ph'));
    if (v) el.placeholder = v;
  });
  document.getElementById('nav-brand-name').textContent = t('app_name');
  document.getElementById('nav-brand-sub').textContent = t('app_tagline');
  document.title = t('app_name');
}

function rebuildDynamicLists() {
  rebuildTitreSelect();
  rebuildRegionSelect();
  rebuildAnalyseSelects();
  rebuildInsuranceGrid();
  rebuildInsuranceCoverage();
  rebuildDrugRows();
  rebuildSpecFields();
}

// ── ROLE ──────────────────────────────────────────────────────
function setRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
  const rc = document.querySelector(`.role-card[data-role="${role}"]`);
  if (rc) rc.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + role);
  if (pg) pg.classList.add('active');
  if (role === 'medecin') initMedecinPage();
  if (role === 'patient') rebuildRegionSelect();
}

// ── SPECIALTY ─────────────────────────────────────────────────
function setSpecialty(spec) {
  currentSpecialty = spec;
  document.querySelectorAll('.spec-card').forEach(c => c.classList.remove('active'));
  const sc = document.querySelector(`.spec-card[data-spec="${spec}"]`);
  if (sc) sc.classList.add('active');
  rebuildSpecFields();
  rebuildDrugRows();
}

function rebuildSpecFields() {
  const container = document.getElementById('spec-fields-container');
  if (!container) return;
  container.innerHTML = '';

  const spec = currentSpecialty;

  if (spec === 'dentiste') {
    container.innerHTML = `
      <div class="spec-fields">
        <div class="spec-fields-title">🦷 ${t('spec_fields_dentiste')}</div>
        <div class="form-grid">
          <div class="form-group">
            <label data-t="dent_dent">${t('dent_dent')}</label>
            <input type="text" id="dent-num" placeholder="Ex: 36, 11, 22...">
          </div>
          <div class="form-group">
            <label data-t="dent_type">${t('dent_type')}</label>
            <select id="dent-type">${tArr('dent_types').map(d => `<option>${d}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label data-t="dent_radio">${t('dent_radio')}</label>
            <select id="dent-radio"><option>Non</option><option>Rétroalvéolaire</option><option>Panoramique</option><option>Cone Beam (CBCT)</option></select>
          </div>
          <div class="form-group">
            <label data-t="dent_anest">${t('dent_anest')}</label>
            <select id="dent-anest"><option>Non</option><option>Locale</option><option>Locorégionale</option><option>Générale</option></select>
          </div>
        </div>
      </div>`;
  } else if (spec === 'ophtalmo' || spec === 'ophtalmologie') {
    container.innerHTML = `
      <div class="spec-fields">
        <div class="spec-fields-title">👁️ ${t('spec_fields_ophtalmo')}</div>
        <div class="form-grid">
          <div class="form-group"><label>${t('oph_od_sphere')}</label><input type="number" id="od-sph" placeholder="-3.00" step="0.25"></div>
          <div class="form-group"><label>${t('oph_od_cylindre')}</label><input type="number" id="od-cyl" placeholder="-1.25" step="0.25"></div>
          <div class="form-group"><label>${t('oph_og_sphere')}</label><input type="number" id="og-sph" placeholder="-2.50" step="0.25"></div>
          <div class="form-group"><label>${t('oph_og_cylindre')}</label><input type="number" id="og-cyl" placeholder="-1.00" step="0.25"></div>
          <div class="form-group"><label>${t('oph_addition')}</label><input type="number" id="oph-add" placeholder="+2.00" step="0.25"></div>
          <div class="form-group"><label>${t('oph_ep')}</label><input type="number" id="oph-ep" placeholder="64 mm"></div>
        </div>
      </div>`;
  } else if (spec === 'kine') {
    container.innerHTML = `
      <div class="spec-fields">
        <div class="spec-fields-title">🏃 ${t('spec_fields_kine')}</div>
        <div class="form-grid">
          <div class="form-group"><label>${t('kine_nb')}</label><input type="number" id="kine-nb" placeholder="Ex: 20" min="1" max="100"></div>
          <div class="form-group"><label>${t('kine_type')}</label><select id="kine-type">${tArr('kine_types').map(k => `<option>${k}</option>`).join('')}</select></div>
          <div class="form-group"><label>${t('kine_freq')}</label><select id="kine-freq">${tArr('freq_list').map(f => `<option>${f}</option>`).join('')}</select></div>
        </div>
      </div>`;
  } else if (spec === 'radio') {
    container.innerHTML = `
      <div class="spec-fields">
        <div class="spec-fields-title">🩻 ${t('spec_fields_radio')}</div>
        <div class="form-grid">
          <div class="form-group"><label>${t('radio_type')}</label><select id="radio-type">${tArr('radio_types').map(r => `<option>${r}</option>`).join('')}</select></div>
          <div class="form-group"><label>${t('radio_region')}</label><select id="radio-region">${tArr('radio_regions').map(r => `<option>${r}</option>`).join('')}</select></div>
          <div class="form-group"><label>${t('radio_injection')}</label><select id="radio-inj"><option>Non</option><option>Produit de contraste IV</option><option>Gadolinium (IRM)</option></select></div>
        </div>
      </div>`;
  } else if (spec === 'psychia') {
    container.innerHTML = `
      <div class="spec-fields">
        <div class="spec-fields-title">🧠 ${t('spec_fields_psychia')}</div>
        <div class="form-grid-2">
          <div class="form-group"><label>${t('psy_type')}</label><select id="psy-type">${tArr('psy_types').map(p => `<option>${p}</option>`).join('')}</select></div>
          <div class="form-group"><label>${t('psy_freq')}</label><select id="psy-freq">${tArr('psy_freqs').map(f => `<option>${f}</option>`).join('')}</select></div>
        </div>
      </div>`;
  }
}

// ── INIT MEDECIN ──────────────────────────────────────────────
function initMedecinPage() {
  rebuildTitreSelect();
  initSignatureCanvas();
  setTodayDate();
  if (drugRowCount === 0) { addDrugRow(); addDrugRow(); }
  rebuildAnalyseSelects();
  rebuildInsuranceGrid();
  rebuildInsuranceCoverage();
  setSpecialty('generaliste');
}

function rebuildTitreSelect() {
  const sel = document.getElementById('med-titre');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  tArr('titres_list').forEach(ti => {
    const o = document.createElement('option');
    o.value = ti; o.textContent = ti;
    if (cur === ti) o.selected = true;
    sel.appendChild(o);
  });
}

function setTodayDate() {
  const el = document.getElementById('date-ordo');
  if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
}

// ── DRUG ROWS ─────────────────────────────────────────────────
function addDrugRow() {
  drugRowCount++;
  const tbody = document.getElementById('drug-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = 'drug-row-' + drugRowCount;

  const drugs = tArr('drugs_list');
  const freqs = tArr('freq_list');
  const durees = tArr('duree_list');
  const conds = tArr('condition_list');
  const moments = tArr('moment_list');
  const dosages = tArr('dosage_list');

  const sel = (opts, cls, ph) => {
    let s = `<select class="${cls}"><option value="">— ${ph} —</option>`;
    opts.forEach(o => s += `<option value="${o}">${o}</option>`);
    return s + '</select>';
  };

  tr.innerHTML = `
    <td class="col-num">${drugRowCount}</td>
    <td class="col-name">${sel(drugs, 'sel-drug', t('col_medicament'))}</td>
    <td class="col-dosage">${sel(dosages, 'sel-dosage', '—')}</td>
    <td class="col-freq">${sel(freqs, 'sel-freq', '—')}</td>
    <td class="col-duration">${sel(durees, 'sel-duree', '—')}</td>
    <td class="col-condition">${sel(conds, 'sel-condition', t('col_condition'))}</td>
    <td class="col-moment">${sel(moments, 'sel-moment', '—')}</td>
    <td class="col-notes"><input type="text" placeholder="..." style="width:100%"></td>
    <td class="col-action"><button class="btn-del-row" onclick="removeDrugRow(${drugRowCount})" title="Supprimer">✕</button></td>`;
  tbody.appendChild(tr);
}

function removeDrugRow(id) {
  const row = document.getElementById('drug-row-' + id);
  if (row) row.remove();
  renumberRows();
}

function renumberRows() {
  document.querySelectorAll('#drug-tbody tr').forEach((r, i) => {
    r.querySelector('.col-num').textContent = i + 1;
  });
}

function rebuildDrugRows() {
  const tbody = document.getElementById('drug-tbody');
  if (!tbody) return;
  const n = drugRowCount || 0;
  tbody.innerHTML = '';
  drugRowCount = 0;
  for (let i = 0; i < Math.max(n, 1); i++) addDrugRow();
}

// ── ANALYSES ──────────────────────────────────────────────────
function rebuildAnalyseSelects() {
  ['1','2','3'].forEach(n => {
    const sel = document.getElementById('analyse-type-' + n);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">— ${t('analyse_type')} —</option>`;
    tArr('analyses_list').forEach(a => {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      if (cur === a) o.selected = true;
      sel.appendChild(o);
    });
    const urg = document.getElementById('urgence-' + n);
    if (urg) {
      urg.innerHTML = '';
      tArr('urgence_list').forEach(u => {
        const o = document.createElement('option');
        o.value = u; o.textContent = u;
        urg.appendChild(o);
      });
    }
  });
}

// ── REGION ────────────────────────────────────────────────────
function rebuildRegionSelect() {
  const sel = document.getElementById('pat-region');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  tArr('pat_region_list').forEach(r => {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    if (cur === r) o.selected = true;
    sel.appendChild(o);
  });
}

// ── INSURANCE ─────────────────────────────────────────────────
function rebuildInsuranceGrid() {
  const grid = document.getElementById('insurance-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const companies = tArr('ins_companies');
  companies.forEach((ins, i) => {
    const div = document.createElement('div');
    div.className = 'ins-card';
    div.onclick = () => selectInsurance(ins, i);
    div.id = 'ins-card-' + i;
    div.innerHTML = `
      <div style="font-size:20px;margin-bottom:4px">${ins.logo}</div>
      <div class="ins-name">${ins.name}</div>
      <div class="ins-type">${ins.type}</div>
      <span class="ins-api ${ins.api === 'auto' ? 'ins-api-auto' : 'ins-api-manual'}">
        ${ins.api === 'auto' ? t('ins_auto_badge') : t('ins_manual_badge')}
      </span>`;
    grid.appendChild(div);
  });
}

function rebuildInsuranceCoverage() {
  const sel = document.getElementById('ins-couv-select');
  if (!sel) return;
  sel.innerHTML = `<option value="">— ${t('ins_type_couv')} —</option>`;
  tArr('ins_couv_types').forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c; sel.appendChild(o);
  });
}

let selectedInsurance = null;

function selectInsurance(ins, idx) {
  selectedInsurance = ins;
  document.querySelectorAll('.ins-card').forEach(c => c.classList.remove('active'));
  const card = document.getElementById('ins-card-' + idx);
  if (card) card.classList.add('active');
}

function verifyInsurance() {
  if (!selectedInsurance) { showToast('⚠ Sélectionnez une compagnie d\'assurance', true); return; }
  const statusDiv = document.getElementById('ins-status');
  if (!statusDiv) return;

  if (selectedInsurance.api === 'auto') {
    statusDiv.className = 'ins-status ins-status-pending';
    statusDiv.innerHTML = `⏳ Vérification via API ${selectedInsurance.name}...`;
    setTimeout(() => {
      statusDiv.className = 'ins-status ins-status-ok';
      statusDiv.innerHTML = `✅ ${t('ins_verified')} — ${selectedInsurance.name} — ${document.getElementById('ins-police')?.value || 'N/A'}`;
      showToast('✅ Couverture assurance vérifiée');
    }, 2000);
  } else {
    const ticketId = 'SC-INS-' + Date.now().toString(36).toUpperCase().slice(-8);
    statusDiv.className = 'ins-status ins-status-manual';
    statusDiv.innerHTML = `📋 ${t('ins_manual_msg')}<br><strong>${t('ins_ticket')} : ${ticketId}</strong>`;
    showToast('📋 Demande de vérification transmise');
  }
}

// ── PAYMENT ───────────────────────────────────────────────────
let selectedPayMethod = null;

function selectPayMethod(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('active'));
  const el = document.querySelector(`.pay-method.${method}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.pay-detail').forEach(d => d.classList.remove('active'));
  const det = document.getElementById('pay-detail-' + method);
  if (det) det.classList.add('active');

  if (method === 'virement') {
    const refEl = document.getElementById('pay-ref-value');
    if (refEl && !refEl.textContent) {
      refEl.textContent = generateVirementRef();
    }
  }
}

function generateVirementRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = 'SC-' + new Date().getFullYear() + '-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function proceedPayment() {
  if (!selectedPayMethod) { showToast('⚠ Sélectionnez une méthode de paiement', true); return; }
  const montant = document.getElementById('pay-montant')?.value;
  if (!montant || montant <= 0) { showToast('⚠ Entrez un montant valide', true); return; }

  const msgs = {
    cmi:      `💳 Redirection vers CMI 3D Secure — ${montant} MAD`,
    payzone:  `🔵 Redirection vers PayZone — ${montant} MAD`,
    virement: `🏦 Référence de virement générée — ${montant} MAD`,
    edahabia: `🟢 Paiement edahabia initié — ${montant} MAD`,
    wafacash: `🔴 Code Wafacash généré — ${montant} MAD`,
    cash:     `💵 Paiement en espèces — ${montant} MAD — Présentez l'ordonnance à la réception`,
  };
  showToast(msgs[selectedPayMethod] || '✅ Paiement initié');
}

// ── SIGNATURE ─────────────────────────────────────────────────
function initSignatureCanvas() {
  sigCanvas = document.getElementById('sigCanvas');
  if (!sigCanvas) return;
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.strokeStyle = '#0A5C7F';
  sigCanvas.width = sigCanvas.offsetWidth || 560;
  sigCanvas.height = 100;

  const getPos = (e) => {
    const rect = sigCanvas.getBoundingClientRect();
    const scaleX = sigCanvas.width / rect.width;
    const scaleY = sigCanvas.height / rect.height;
    if (e.touches) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  sigCanvas.addEventListener('mousedown', e => { signing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
  sigCanvas.addEventListener('mousemove', e => { if (!signing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); hasSig = true; });
  sigCanvas.addEventListener('mouseup', () => signing = false);
  sigCanvas.addEventListener('mouseleave', () => signing = false);
  sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); signing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, { passive: false });
  sigCanvas.addEventListener('touchmove', e => { e.preventDefault(); if (!signing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); hasSig = true; }, { passive: false });
  sigCanvas.addEventListener('touchend', () => signing = false);
}

function clearSignature() {
  if (!sigCtx || !sigCanvas) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  hasSig = false;
}

// ── VALIDATION ────────────────────────────────────────────────
function validateMedecin() {
  let ok = true;
  const required = ['med-nom','med-prenom','med-cabinet','med-ville','med-tel','pat-nom-m','pat-prenom-m','pat-dob-m','diag-main'];
  required.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const group = el.closest('.form-group');
    if (!el.value.trim()) {
      ok = false;
      if (group) group.classList.add('has-error');
      el.classList.add('error');
    } else {
      if (group) group.classList.remove('has-error');
      el.classList.remove('error');
    }
  });
  if (!ok) { showToast('⚠ ' + t('fill_required'), true); return false; }

  const drugs = document.querySelectorAll('#drug-tbody tr');
  let hasDrug = false;
  drugs.forEach(r => { if (r.querySelector('.sel-drug')?.value) hasDrug = true; });
  if (!hasDrug) { showToast('⚠ ' + t('fill_drugs'), true); return false; }
  return true;
}

// ── PREVIEW & SEND ────────────────────────────────────────────
function previewOrdo() {
  if (!validateMedecin()) return;
  buildPreview();
  document.getElementById('preview-modal').classList.remove('hidden');
}

function closePreview() {
  document.getElementById('preview-modal').classList.add('hidden');
}

function sendOrdoFinal() {
  closePreview();
  onEnvoyerOrdonnance();
}

function buildPreview() {
  const body = document.getElementById('preview-body');
  if (!body) return;

  const gv = id => document.getElementById(id)?.value || '';

  const medNom     = gv('med-nom') + ' ' + gv('med-prenom');
  const medTitre   = gv('med-titre');
  const medCabinet = gv('med-cabinet');
  const medVille   = gv('med-ville');
  const medTel     = gv('med-tel');
  const patNom     = gv('pat-nom-m') + ' ' + gv('pat-prenom-m');
  const patDob     = gv('pat-dob-m');
  const patCin     = gv('pat-cin-m');
  const patTel     = gv('pat-tel-m');
  const patSexe    = gv('pat-sexe-m');
  const patPoids   = gv('pat-poids-m');
  const patTaille  = gv('pat-taille-m');
  const patAllerg  = gv('pat-allergies-m');
  const diag       = gv('diag-main');
  const notes      = gv('diag-notes');
  const dateOrdo   = gv('date-ordo');
  const lieu       = gv('lieu-ordo');

  let drugsHtml = '';
  document.querySelectorAll('#drug-tbody tr').forEach((r, i) => {
    const drug = r.querySelector('.sel-drug')?.value;
    if (!drug) return;
    const dosage = r.querySelector('.sel-dosage')?.value || '';
    const freq   = r.querySelector('.sel-freq')?.value || '';
    const duree  = r.querySelector('.sel-duree')?.value || '';
    const cond   = r.querySelector('.sel-condition')?.value || '';
    const moment = r.querySelector('.sel-moment')?.value || '';
    const noteD  = r.querySelector('input[type="text"]')?.value || '';
    drugsHtml += `<tr>
      <td style="padding:5px 8px;font-weight:600;color:#0A5C7F;border-bottom:1px solid #eee">${i+1}. ${drug}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${dosage}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${freq}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:12px">${duree}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;color:#4A5568">${cond}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px">${moment}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;color:#8A98AD">${noteD}</td>
    </tr>`;
  });

  let analysesHtml = '';
  ['1','2','3'].forEach(n => {
    const sel = document.getElementById('analyse-type-' + n);
    const urg = document.getElementById('urgence-' + n);
    if (sel?.value) {
      analysesHtml += `<div style="padding:5px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
        <span>🔬 ${sel.value}</span>
        <span style="font-size:11px;background:#FEF0ED;color:#E5533D;padding:1px 8px;border-radius:10px">${urg?.value || ''}</span>
      </div>`;
    }
  });

  const sigImg = hasSig && sigCanvas ? `<img src="${sigCanvas.toDataURL()}" style="max-height:55px">` : `<span style="color:#8A98AD;font-style:italic;font-size:11px">Non signé</span>`;

  body.innerHTML = `
    <div class="preview-section">
      <div class="preview-section-title">${t('doctor_info')}</div>
      <div class="preview-grid">
        <div class="preview-field"><div class="preview-label">${t('med_nom')} / ${t('med_prenom')}</div><div class="preview-value">${medTitre} ${medNom}</div></div>
        <div class="preview-field"><div class="preview-label">${t('med_cabinet')}</div><div class="preview-value">${medCabinet}</div></div>
        <div class="preview-field"><div class="preview-label">${t('med_ville')} / ${t('med_tel')}</div><div class="preview-value">${medVille} — ${medTel}</div></div>
      </div>
    </div>
    <div class="preview-section">
      <div class="preview-section-title">${t('patient_info')}</div>
      <div class="preview-grid">
        <div class="preview-field"><div class="preview-label">${t('pat_nom')} / ${t('pat_prenom')}</div><div class="preview-value">${patNom}</div></div>
        <div class="preview-field"><div class="preview-label">${t('pat_dob')}</div><div class="preview-value">${patDob}</div></div>
        <div class="preview-field"><div class="preview-label">${t('pat_cin')}</div><div class="preview-value">${patCin}</div></div>
        <div class="preview-field"><div class="preview-label">${t('pat_tel')}</div><div class="preview-value">${patTel}</div></div>
        <div class="preview-field"><div class="preview-label">${t('pat_sexe')} / ${t('pat_poids')}</div><div class="preview-value">${patSexe} — ${patPoids}kg — ${patTaille}cm</div></div>
        ${patAllerg ? `<div class="preview-field"><div class="preview-label" style="color:#E5533D">⚠️ ${t('pat_allergies')}</div><div class="preview-value" style="color:#E5533D;font-weight:600">${patAllerg}</div></div>` : ''}
      </div>
    </div>
    <div class="preview-section">
      <div class="preview-section-title">${t('diag_label')}</div>
      <div style="background:#F7F9FC;padding:9px 13px;border-radius:8px;font-weight:500;color:#0A5C7F;font-size:13px">${diag}</div>
      ${notes ? `<div style="margin-top:7px;font-size:12px;color:#4A5568">${notes}</div>` : ''}
    </div>
    <div class="preview-section">
      <div class="preview-section-title">${t('prescription')}</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#EEF2F7">
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_medicament')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_dosage')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_frequence')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_duree')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_condition')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_moment')}</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px">${t('col_notes')}</th>
          </tr></thead>
          <tbody>${drugsHtml}</tbody>
        </table>
      </div>
    </div>
    ${analysesHtml ? `<div class="preview-section"><div class="preview-section-title">${t('lab_orders')}</div>${analysesHtml}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
      <div>
        <div class="preview-label">${t('date_label')}</div><div class="preview-value">${dateOrdo}</div>
        <div class="preview-label" style="margin-top:8px">${t('place_label')}</div><div class="preview-value">${lieu}</div>
      </div>
      <div><div class="preview-label">${t('sig_title')}</div>${sigImg}</div>
    </div>`;

  document.getElementById('preview-modal-title').textContent = t('preview_title');
}

// ── PATIENT ───────────────────────────────────────────────────
function savePatientPrefs() { showToast('✅ ' + t('prefs_saved')); }

// ── LABO ──────────────────────────────────────────────────────
function confirmLaboReq(btn) {
  const card = btn.closest('.req-card');
  const badge = card.querySelector('.badge');
  badge.className = 'badge badge-done';
  badge.textContent = t('badge_confirmed');
  btn.closest('.req-actions').innerHTML = `<span style="font-size:12px;color:var(--success);font-weight:500">✓ ${t('badge_confirmed')} — WhatsApp envoyé 📱</span>`;
  showToast('✅ ' + t('confirm_dispo'));
}

function rejectLaboReq(btn) {
  btn.closest('.req-card').style.opacity = '0.4';
  btn.closest('.req-card').style.pointerEvents = 'none';
  showToast('❌ ' + t('reject'));
}

function proposeRdv(btn) {
  const slot = prompt(t('propose_rdv') + ' :');
  if (slot) showToast('📅 ' + slot);
}

// ── PHARMACIE ─────────────────────────────────────────────────
function confirmPharmaReq(btn) {
  const card = btn.closest('.req-card');
  const badge = card.querySelector('.badge');
  badge.className = 'badge badge-done';
  badge.textContent = t('badge_confirmed');
  btn.closest('.req-actions').innerHTML = `<span style="font-size:12px;color:var(--success);font-weight:500">✓ ${t('badge_confirmed')} — WhatsApp envoyé 📱</span>`;
  showToast('✅ ' + t('confirm_stock'));
}

function setPharmaPrice(btn) {
  const price = prompt(currentLang === 'ar' ? 'السعر الإجمالي بالدرهم :' : currentLang === 'en' ? 'Total price in MAD:' : 'Prix total en MAD :');
  if (price) showToast('💰 ' + price + ' MAD ' + (currentLang === 'ar' ? 'تم التحديد' : 'communiqué'));
}

function rejectPharmaReq(btn) {
  btn.closest('.req-card').style.opacity = '0.4';
  btn.closest('.req-card').style.pointerEvents = 'none';
  showToast('❌ ' + t('manquant'));
}

function updateStock() {
  const med = document.getElementById('stock-med')?.value?.trim();
  const qty = document.getElementById('stock-qty')?.value;
  if (!med || !qty) { showToast('⚠ ' + t('fill_required'), true); return; }
  showToast('✅ ' + t('update_stock') + ' — ' + med + ' (' + qty + ')');
  document.getElementById('stock-med').value = '';
  document.getElementById('stock-qty').value = '';
}

// ── WHATSAPP ──────────────────────────────────────────────────
async function onEnvoyerOrdonnance() {
  const data = collectOrdoData();
  showToast('💬 Envoi des notifications WhatsApp…');
  try {
    const r = await fetch((window.API_BASE || '/api') + '/ordonnances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const d = await r.json();
    showWAPanel(d.success, d.notifications);
    showToast(d.success ? '✅ ' + t('sent_ok') : '⚠ Erreur: ' + d.error, !d.success);
  } catch {
    showWAPanel(null, 0);
    showToast('✅ ' + t('sent_ok') + ' (demo)');
  }
}

function collectOrdoData() {
  const gv = id => document.getElementById(id)?.value?.trim() || '';
  const medicaments = [];
  document.querySelectorAll('#drug-tbody tr').forEach(r => {
    const nom = r.querySelector('.sel-drug')?.value;
    if (!nom) return;
    medicaments.push({
      nom, dosage: r.querySelector('.sel-dosage')?.value || '',
      frequence: r.querySelector('.sel-freq')?.value || '',
      duree: r.querySelector('.sel-duree')?.value || '',
      condition_util: r.querySelector('.sel-condition')?.value || '',
      moment: r.querySelector('.sel-moment')?.value || '',
      notes: r.querySelector('input[type="text"]')?.value || '',
    });
  });
  const analyses = [];
  ['1','2','3'].forEach(n => {
    const nom = document.getElementById('analyse-type-' + n)?.value;
    if (nom) analyses.push({ nom, urgence: document.getElementById('urgence-' + n)?.value || 'Normal' });
  });
  return {
    medecin: { nom: gv('med-nom'), prenom: gv('med-prenom'), titre: gv('med-titre'), cabinet: gv('med-cabinet'), ville: gv('med-ville'), telephone: gv('med-tel'), email: gv('med-email'), inpe: gv('med-inpe') },
    patient: { nom: gv('pat-nom-m'), prenom: gv('pat-prenom-m'), dob: gv('pat-dob-m'), cin: gv('pat-cin-m'), telephone: gv('pat-tel-m'), sexe: gv('pat-sexe-m'), poids: gv('pat-poids-m'), taille: gv('pat-taille-m'), allergies: gv('pat-allergies-m'), antecedents: gv('pat-antecedents-m') },
    pharmacie: { nom: document.getElementById('pharmacie-nom-wa')?.value || '', telephone: document.getElementById('pharmacie-tel')?.value || '' },
    laboratoire: { nom: document.getElementById('labo-nom-wa')?.value || '', telephone: document.getElementById('labo-tel')?.value || '' },
    medicaments, analyses,
    diagnostic: gv('diag-main'), notes: gv('diag-notes'),
    date_ordo: gv('date-ordo'), lieu: gv('lieu-ordo'),
    specialty: currentSpecialty,
  };
}

async function testerNotificationWA(role, telId) {
  const tel = document.getElementById(telId)?.value?.trim();
  if (!tel) { showToast('⚠ Entrez un numéro', true); return; }
  showToast('📤 Envoi du message test…');
  try {
    const r = await fetch((window.API_BASE || '/api') + '/notify/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tel, role })
    });
    const d = await r.json();
    showToast(d.ok ? '✅ Message test envoyé !' : '❌ ' + d.error, !d.ok);
  } catch {
    setTimeout(() => showToast('✅ Test simulé (démo) — ' + tel), 800);
  }
}

function showWAPanel(ok, count, err) {
  const panel = document.getElementById('wa-panel');
  if (!panel) return;
  panel.style.display = 'block';
  const dest = [
    { icon: '🧑‍⚕️', label: 'Patient', ok: true },
    { icon: '💊', label: currentLang === 'ar' ? 'الصيدلية' : 'Pharmacie', ok: true },
    { icon: '🔬', label: currentLang === 'ar' ? 'المختبر' : 'Laboratoire', ok: true },
  ];
  const rows = dest.map(d => `<div class="wa-row"><span class="wa-dest">${d.icon} ${d.label}</span><span class="wa-status ok">✅ ${ok === null ? 'Simulé <em>(démo)</em>' : 'Envoyé'}</span></div>`).join('');
  const note = ok === null ? `<div class="wa-demo-note">💡 Configurez <code>.env</code> et démarrez le serveur Node.js pour les vrais envois. Voir <code>DEPLOIEMENT.md</code></div>` : '';
  panel.innerHTML = `<div class="wa-panel-inner">
    <div class="wa-panel-header"><span style="font-size:18px">💬</span><div><div class="wa-panel-title">${t('wa_title')}</div><div class="wa-panel-sub">${ok === null ? 'Mode démo' : count + ' message(s) envoyé(s) via Twilio'}</div></div></div>
    ${rows}${note}
  </div>`;
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--danger)' : 'var(--primary-dark)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

// ── UPDATE BANNER ─────────────────────────────────────────────
function dismissBanner() {
  const b = document.getElementById('update-banner');
  if (b) b.style.display = 'none';
}

// ── ROLE CARD TILT (mouse-follow 3D effect) ────────────────────
function initRoleCardTilt() {
  document.querySelectorAll('.role-card').forEach(card => {
    card.style.transformStyle = 'preserve-3d';
    card.style.perspective = '600px';
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `translateY(-4px) rotateX(${py * -10}deg) rotateY(${px * 10}deg) scale(1.02)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

// ── STATS COUNT-UP ──────────────────────────────────────────────
function initStatsCountUp() {
  document.querySelectorAll('.stat-chip .stat-value').forEach(el => {
    const target = parseInt(el.textContent, 10);
    if (isNaN(target)) return;
    const dur = 1100;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  setTodayDate();
  rebuildRegionSelect();
  rebuildInsuranceGrid();
  rebuildInsuranceCoverage();
  initRoleCardTilt();
  initStatsCountUp();
});
