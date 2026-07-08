// public/js/api-client.js — SantéConnect v3 | Vita Tech | vita-core.org

// Auto-detect API base URL
window.API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// Supabase public keys from meta tags
const SUPA_URL = document.querySelector('meta[name="supa-url"]')?.content || '';
const SUPA_KEY = document.querySelector('meta[name="supa-key"]')?.content || '';

// ── SERVER STATUS ─────────────────────────────────────────────
async function checkServer() {
  try {
    const r = await fetch(window.API_BASE + '/status', { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    updateServerBadge(d.status === 'ok', d.supabase, d.whatsapp);
  } catch {
    updateServerBadge(false, false, false);
  }
}

function updateServerBadge(ok, supa, wa) {
  const b = document.getElementById('server-badge');
  if (!b) return;
  if (ok) {
    b.innerHTML = `<span style="color:var(--success)">● Connecté</span>
      <span style="color:var(--text-3);font-size:10px;margin-left:6px">
        ${supa ? '🗄 Supabase ✓' : ''} ${wa ? '💬 WA ✓' : ''}
      </span>`;
  } else {
    b.innerHTML = `<span style="color:var(--warning)">● Mode démo</span>
      <span style="color:var(--text-3);font-size:10px;margin-left:6px">Configurez .env</span>`;
  }
}

// ── LOAD PHARMACIES & LABOS ───────────────────────────────────
async function loadPharmaciesLabos() {
  try {
    const [pharmacies, labos] = await Promise.all([
      fetch(window.API_BASE + '/pharmacies').then(r => r.json()).catch(() => []),
      fetch(window.API_BASE + '/laboratoires').then(r => r.json()).catch(() => []),
    ]);
    fillSelect('pharmacie-nom-wa-sel', pharmacies, 'nom', 'telephone', 'Pharmacie');
    fillSelect('labo-nom-wa-sel', labos, 'nom', 'telephone', 'Laboratoire');
  } catch {}
}

function fillSelect(id, items, nameKey, telKey, label) {
  const sel = document.getElementById(id);
  if (!sel || !Array.isArray(items)) return;
  sel.innerHTML = `<option value="">— ${label} —</option>`;
  items.forEach(item => {
    const o = document.createElement('option');
    o.value = JSON.stringify({ nom: item[nameKey], telephone: item[telKey] || '' });
    o.textContent = item[nameKey] + (item.ville ? ' — ' + item.ville : '');
    sel.appendChild(o);
  });
  sel.onchange = () => {
    try {
      const v = JSON.parse(sel.value);
      const nomEl = document.getElementById(id.replace('-sel', ''));
      const telEl = document.getElementById(id.replace('nom-wa-sel', 'tel'));
      if (nomEl) nomEl.value = v.nom;
      if (telEl) telEl.value = v.telephone;
    } catch {}
  };
}

// ── SEND ORDONNANCE ───────────────────────────────────────────
async function onEnvoyerOrdonnance() {
  const data = collectOrdoData();
  showToast('💬 Envoi en cours…');
  try {
    const r = await fetch(window.API_BASE + '/ordonnances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (d.success) {
      showWAResult(true, d.notifications);
      showToast('✅ ' + (typeof t === 'function' ? t('sent_ok') : 'Ordonnance envoyée + WhatsApp ✅'));
    } else {
      showWAResult(false, 0, d.error);
      showToast('⚠ ' + (d.error || 'Erreur'), true);
    }
  } catch {
    showWAResult(null, 3);
    showToast('✅ Ordonnance simulée (démo)');
  }
}

function collectOrdoData() {
  const gv = id => document.getElementById(id)?.value?.trim() || '';
  const medicaments = [];
  document.querySelectorAll('#drug-tbody tr').forEach(r => {
    const nom = r.querySelector('.sel-drug')?.value;
    if (!nom) return;
    medicaments.push({
      nom,
      dosage:        r.querySelector('.sel-dosage')?.value    || '',
      frequence:     r.querySelector('.sel-freq')?.value      || '',
      duree:         r.querySelector('.sel-duree')?.value     || '',
      condition_util:r.querySelector('.sel-condition')?.value || '',
      moment:        r.querySelector('.sel-moment')?.value    || '',
      notes:         r.querySelector('input[type="text"]')?.value || '',
    });
  });
  const analyses = [];
  ['1','2','3'].forEach(n => {
    const nom = document.getElementById('analyse-type-' + n)?.value;
    if (nom) analyses.push({ nom, urgence: document.getElementById('urgence-' + n)?.value || 'Normal' });
  });

  // Pharmacie & Labo depuis les inputs
  const pharmaNom = gv('pharmacie-nom-wa');
  const pharmaTel = gv('pharmacie-tel');
  const laboNom   = gv('labo-nom-wa');
  const laboTel   = gv('labo-tel');

  return {
    medecin: {
      nom: gv('med-nom'), prenom: gv('med-prenom'), titre: gv('med-titre'),
      cabinet: gv('med-cabinet'), ville: gv('med-ville'),
      telephone: gv('med-tel'), email: gv('med-email'), inpe: gv('med-inpe'),
    },
    patient: {
      nom: gv('pat-nom-m'), prenom: gv('pat-prenom-m'), dob: gv('pat-dob-m'),
      cin: gv('pat-cin-m'), telephone: gv('pat-tel-m') || gv('wa-patient-tel'),
      sexe: gv('pat-sexe-m'), poids: gv('pat-poids-m'), taille: gv('pat-taille-m'),
      allergies: gv('pat-allergies-m'), antecedents: gv('pat-antecedents-m'),
      assurance: gv('pat-assurance-m'),
    },
    pharmacie:   pharmaNom ? { nom: pharmaNom, telephone: pharmaTel } : null,
    laboratoire: laboNom   ? { nom: laboNom,   telephone: laboTel   } : null,
    medicaments, analyses,
    diagnostic:   gv('diag-main'),
    notes:        gv('diag-notes'),
    date_ordo:    gv('date-ordo'),
    lieu:         gv('lieu-ordo'),
    analyseNotes: gv('analyse-notes'),
    specialty:    window.currentSpecialty || 'generaliste',
  };
}

// ── WA PANEL ─────────────────────────────────────────────────
function showWAResult(ok, count, err) {
  const panel = document.getElementById('wa-panel');
  if (!panel) return;
  panel.style.display = 'block';

  const isDemo = ok === null;
  const label  = isDemo ? 'Simulé <em>(démo)</em>' : 'Envoyé via Twilio';
  const rows = [
    { icon: '🧑‍⚕️', name: 'Patient' },
    { icon: '💊',   name: 'Pharmacie' },
    { icon: '🔬',   name: 'Laboratoire' },
  ].map(d => `<div class="wa-row"><span class="wa-dest">${d.icon} ${d.name}</span>
    <span class="wa-status ok">✅ ${label}</span></div>`).join('');

  const note = isDemo ? `<div class="wa-demo-note">
    💡 Pour activer les vrais messages : configurez <code>.env</code> et déployez sur Vercel.
    Voir <code>DEPLOIEMENT.md</code>
  </div>` : '';

  panel.innerHTML = `<div class="wa-panel-inner">
    <div class="wa-panel-header">
      <span style="font-size:18px">💬</span>
      <div>
        <div class="wa-panel-title">Notifications WhatsApp</div>
        <div class="wa-panel-sub">${isDemo ? 'Mode démo — vita-core.org' : count + ' message(s) Twilio envoyé(s)'}</div>
      </div>
    </div>
    ${rows}${note}
  </div>`;
}

// ── TEST WA ───────────────────────────────────────────────────
async function testerNotificationWA(role, telId) {
  const tel = document.getElementById(telId)?.value?.trim();
  if (!tel) { showToast('⚠ Entrez un numéro', true); return; }
  showToast('📤 Envoi test…');
  try {
    const r = await fetch(window.API_BASE + '/notify/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tel, role }),
    });
    const d = await r.json();
    showToast(d.ok ? '✅ Message test envoyé !' : '❌ ' + d.error, !d.ok);
  } catch {
    showToast('✅ Test simulé (démo) — ' + tel);
  }
}

// ── INSURANCE ─────────────────────────────────────────────────
async function verifyInsuranceAPI(compagnie, police, couv) {
  try {
    const r = await fetch(window.API_BASE + '/assurances/verifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compagnie, numero_police: police, type_couverture: couv }),
    });
    return await r.json();
  } catch {
    return null;
  }
}

// ── PAYMENT ───────────────────────────────────────────────────
async function initiatePaymentAPI(montant, methode, ordonnanceId) {
  try {
    const r = await fetch(window.API_BASE + '/paiements/initier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montant, methode, ordonnance_id: ordonnanceId || null, devise: 'MAD' }),
    });
    return await r.json();
  } catch (e) {
    return { error: e.message };
  }
}

// Override proceedPayment to use API
window.proceedPayment = async function() {
  const method = window.selectedPayMethod;
  if (!method) { showToast('⚠ Sélectionnez une méthode de paiement', true); return; }
  const montant = document.getElementById('pay-montant')?.value;
  if (!montant || parseFloat(montant) <= 0) { showToast('⚠ Entrez un montant valide', true); return; }

  showToast('💳 Initiation du paiement…');
  const result = await initiatePaymentAPI(parseFloat(montant), method, null);

  if (result?.reference) {
    const refEl = document.getElementById('pay-ref-value');
    if (refEl) refEl.textContent = result.reference;
    showToast('✅ Référence générée : ' + result.reference);
  } else if (result?.redirect_url) {
    showToast('💳 Redirection vers CMI 3D Secure…');
    // window.location.href = result.redirect_url; // décommenter en prod
  } else if (result?.error) {
    showToast('⚠ ' + result.error, true);
  } else {
    showToast('✅ Paiement ' + method.toUpperCase() + ' initié — ' + montant + ' MAD');
  }
};

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  checkServer();
  setInterval(checkServer, 20000);
  loadPharmaciesLabos();
});
