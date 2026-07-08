// api/server.js — SantéConnect v3 by Vita Tech
// Domain: vita-core.org
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const crypto   = require('crypto');
const { supabase } = require('../lib/supabase');
const wa = require('../lib/whatsapp');

const app = express();

// ── SECURITY HEADERS ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", process.env.SUPABASE_URL || '', "https://api.twilio.com"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use(cors({
  origin: [
    'https://vita-core.org',
    'https://www.vita-core.org',
    'https://sante.vita-core.org',
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ],
  methods: ['GET','POST','PUT','DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── RATE LIMITING ─────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 5, skipSuccessfulRequests: true }));
app.use('/api/paiements/', rateLimit({ windowMs: 60*60*1000, max: 10 }));

// ── STATUS ────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const { data, error } = await supabase.from('ordonnances').select('count', { count: 'exact', head: true });
  res.json({
    status: 'ok',
    service: 'SantéConnect v3',
    powered_by: 'Vita Tech',
    domain: 'vita-core.org',
    supabase: !error,
    whatsapp: !!process.env.TWILIO_ACCOUNT_SID,
    timestamp: new Date().toISOString(),
  });
});

// ── LISTS ─────────────────────────────────────────────────────
app.get('/api/pharmacies', async (req, res) => {
  const { data, error } = await supabase.from('pharmacies').select('*').order('nom');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/laboratoires', async (req, res) => {
  const { data, error } = await supabase.from('laboratoires').select('*').order('nom');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── SEND ORDONNANCE ───────────────────────────────────────────
app.post('/api/ordonnances', async (req, res) => {
  const { medecin, patient, pharmacie, laboratoire, medicaments, analyses, diagnostic, notes, date_ordo, lieu, specialty } = req.body;
  try {
    // 1. Insert médecin
    const { data: med, error: medErr } = await supabase.from('medecins').insert([{
      nom: medecin.nom, prenom: medecin.prenom, titre: medecin.titre,
      cabinet: medecin.cabinet, ville: medecin.ville,
      telephone: medecin.telephone, email: medecin.email || null,
      inpe: medecin.inpe || null,
    }]).select().single();
    if (medErr) throw medErr;

    // 2. Insert patient
    const { data: pat, error: patErr } = await supabase.from('patients').insert([{
      nom: patient.nom, prenom: patient.prenom, dob: patient.dob,
      cin: patient.cin || null, telephone: patient.telephone,
      sexe: patient.sexe || null, poids: patient.poids || null,
      taille: patient.taille || null, allergies: patient.allergies || null,
      antecedents: patient.antecedents || null, assurance: patient.assurance || null,
    }]).select().single();
    if (patErr) throw patErr;

    // 3. Resolve pharmacie
    let pharmaId = null;
    if (pharmacie?.nom) {
      const { data: ph } = await supabase.from('pharmacies').select('id').eq('nom', pharmacie.nom).maybeSingle();
      if (ph) pharmaId = ph.id;
      else {
        const { data: nph } = await supabase.from('pharmacies').insert([{ nom: pharmacie.nom, telephone: pharmacie.telephone || null }]).select().single();
        pharmaId = nph?.id;
      }
    }

    // 4. Resolve laboratoire
    let laboId = null;
    if (laboratoire?.nom) {
      const { data: lb } = await supabase.from('laboratoires').select('id').eq('nom', laboratoire.nom).maybeSingle();
      if (lb) laboId = lb.id;
      else {
        const { data: nlb } = await supabase.from('laboratoires').insert([{ nom: laboratoire.nom, telephone: laboratoire.telephone || null }]).select().single();
        laboId = nlb?.id;
      }
    }

    // 5. Create ordonnance
    const { data: ordo, error: ordoErr } = await supabase.from('ordonnances').insert([{
      medecin_id:   med.id,
      patient_id:   pat.id,
      pharmacie_id: pharmaId,
      labo_id:      laboId,
      diagnostic,
      notes:        notes || null,
      date_ordo:    date_ordo || new Date().toISOString().slice(0,10),
      lieu:         lieu || null,
      statut:       'envoyee',
      specialty:    specialty || 'generaliste',
    }]).select().single();
    if (ordoErr) throw ordoErr;

    // 6. Insert médicaments
    if (medicaments?.length) {
      await supabase.from('medicaments_prescrits').insert(
        medicaments.map((m, i) => ({ ...m, ordonnance_id: ordo.id, ordre: i + 1 }))
      );
    }

    // 7. Insert analyses
    if (analyses?.length) {
      await supabase.from('analyses_prescrites').insert(
        analyses.map(a => ({ ...a, ordonnance_id: ordo.id }))
      );
    }

    // 8. WhatsApp notifications
    const dateStr = new Date(ordo.date_ordo).toLocaleDateString('fr-MA');
    const waBase = {
      patPrenom: pat.prenom, patNom: pat.nom,
      patDob: pat.dob, patSexe: pat.sexe,
      assurance: pat.assurance, allergies: pat.allergies,
      medTitre: med.titre, medNom: med.nom + ' ' + med.prenom,
      cabinet: med.cabinet, ville: med.ville,
      diagnostic, date: dateStr,
      meds: medicaments || [], analyses: analyses || [],
      instructions: req.body.analyseNotes || '',
      specialty: specialty || 'Généraliste',
    };

    const notifs = [];

    if (pat.telephone) {
      const r = await wa.send(pat.telephone, wa.tpl.patient_ordo(waBase));
      notifs.push({ ordonnance_id: ordo.id, destinataire: 'patient', telephone: pat.telephone, message: 'ordo', statut: r.ok ? 'envoye' : 'erreur', twilio_sid: r.sid || null });
    }
    if (pharmacie?.telephone && medicaments?.length) {
      const r = await wa.send(pharmacie.telephone, wa.tpl.pharmacie_ordo({ ...waBase, pharmaNom: pharmacie.nom }));
      notifs.push({ ordonnance_id: ordo.id, destinataire: 'pharmacie', telephone: pharmacie.telephone, message: 'ordo', statut: r.ok ? 'envoye' : 'erreur', twilio_sid: r.sid || null });
    }
    if (laboratoire?.telephone && analyses?.length) {
      const r = await wa.send(laboratoire.telephone, wa.tpl.labo_demande({ ...waBase, laboNom: laboratoire.nom }));
      notifs.push({ ordonnance_id: ordo.id, destinataire: 'labo', telephone: laboratoire.telephone, message: 'analyses', statut: r.ok ? 'envoye' : 'erreur', twilio_sid: r.sid || null });
    }
    if (notifs.length) await supabase.from('notifications_wa').insert(notifs);

    res.status(201).json({ success: true, ordonnance_id: ordo.id, notifications: notifs.length });

  } catch (err) {
    console.error('[POST /api/ordonnances]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PHARMACIE CONFIRM ─────────────────────────────────────────
app.post('/api/confirmations/pharmacie', async (req, res) => {
  const { ordonnance_id, pharmacie_id, prix_total, medicaments_dispo, medicaments_manq, message } = req.body;
  try {
    await supabase.from('confirmations_pharmacie').insert([{
      ordonnance_id, pharmacie_id, statut: 'confirme',
      prix_total, medicaments_dispo, medicaments_manq, message,
      confirmed_at: new Date().toISOString()
    }]);
    await supabase.from('ordonnances').update({ statut: 'pharmacie_confirmee' }).eq('id', ordonnance_id);

    const { data: ordo } = await supabase.from('ordonnances')
      .select('*, patients(*), medecins(*), pharmacies(*)')
      .eq('id', ordonnance_id).single();

    if (ordo?.patients?.telephone) {
      await wa.send(ordo.patients.telephone, wa.tpl.patient_pharma_ok({
        patPrenom: ordo.patients.prenom,
        pharmaNom: ordo.pharmacies?.nom || '',
        pharmaAdresse: ordo.pharmacies?.adresse || '',
        prix: prix_total,
        manquants: medicaments_manq || [],
      }));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LABO CONFIRM ──────────────────────────────────────────────
app.post('/api/confirmations/labo', async (req, res) => {
  const { ordonnance_id, labo_id, rdv_date, rdv_heure, instructions, jeun_requis } = req.body;
  try {
    await supabase.from('confirmations_labo').insert([{
      ordonnance_id, labo_id, statut: 'confirme',
      rdv_date, rdv_heure, instructions, jeun_requis,
      confirmed_at: new Date().toISOString()
    }]);
    await supabase.from('ordonnances').update({ statut: 'labo_confirmee' }).eq('id', ordonnance_id);

    const { data: ordo } = await supabase.from('ordonnances')
      .select('*, patients(*), laboratoires(*)')
      .eq('id', ordonnance_id).single();

    if (ordo?.patients?.telephone) {
      await wa.send(ordo.patients.telephone, wa.tpl.patient_rdv_ok({
        patPrenom: ordo.patients.prenom,
        laboNom: ordo.laboratoires?.nom || '',
        laboAdresse: ordo.laboratoires?.adresse || '',
        rdvDate: new Date(rdv_date).toLocaleDateString('fr-MA'),
        rdvHeure: rdv_heure,
        instructions,
        jeun: jeun_requis,
      }));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INSURANCE VERIFY ──────────────────────────────────────────
app.post('/api/assurances/verifier', async (req, res) => {
  const { compagnie, numero_police, type_couverture, patient_id } = req.body;
  const autoAPIs = ['CNSS', 'CNOPS'];

  if (autoAPIs.includes(compagnie)) {
    // Simulation API automatique (à remplacer par vraie intégration)
    setTimeout(async () => {
      const ticketId = crypto.randomUUID();
      await supabase.from('assurance_queue').insert([{
        id: ticketId, patient_id: patient_id || null,
        compagnie, numero_police, type_couverture, statut: 'verifie_auto',
        created_at: new Date().toISOString(),
      }]).catch(() => {});
    }, 0);
    return res.json({
      mode: 'automatique', compagnie,
      couverture: { statut: 'actif', taux: '70%', plafond: '30000 MAD', type: type_couverture },
    });
  }

  // Manual queue (Scénario B)
  const ticketId = 'SC-INS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await supabase.from('assurance_queue').insert([{
    id: ticketId, patient_id: patient_id || null,
    compagnie, numero_police, type_couverture,
    statut: 'en_attente',
    sla_deadline: new Date(Date.now() + 24*60*60*1000).toISOString(),
    created_at: new Date().toISOString(),
  }]).catch(() => {});

  res.json({ mode: 'manuel', ticket_id: ticketId, message: 'Vérification manuelle. Confirmation sous 24h.', compagnie });
});

// ── PAYMENT INITIATE ──────────────────────────────────────────
app.post('/api/paiements/initier', async (req, res) => {
  const { montant, methode, ordonnance_id, patient_id } = req.body;
  if (!montant || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });

  try {
    if (methode === 'cmi') {
      const txId = 'CMI-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const payload = {
        clientid: process.env.CMI_CLIENT_ID || 'VITACORE',
        amount: parseFloat(montant).toFixed(2),
        currency: '504',
        oid: txId,
        okurl: `https://vita-core.org/paiement/success?ref=${txId}`,
        failurl: `https://vita-core.org/paiement/error?ref=${txId}`,
        lang: 'fr',
        use3DSecure: 'Y',
        BillToName: req.body.patientNom || 'Patient',
        email: req.body.patientEmail || '',
      };
      await supabase.from('transactions').insert([{
        id: txId, ordonnance_id: ordonnance_id || null,
        montant, devise: 'MAD', methode: 'cmi', statut: 'pending',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30*60*1000).toISOString(),
      }]).catch(() => {});
      return res.json({ method: 'cmi', transaction_id: txId, redirect_url: process.env.CMI_GATEWAY_URL || 'https://testpayment.cmi.co.ma/fim/est3Dgate', form_data: payload });
    }

    if (methode === 'virement') {
      const ref = 'SC-' + new Date().getFullYear() + '-' + crypto.createHmac('sha256', process.env.VIREMENT_SECRET || 'vitacore')
        .update(`${ordonnance_id}:${montant}:${Date.now()}`).digest('hex').slice(0,8).toUpperCase();
      await supabase.from('transactions').insert([{
        id: ref, ordonnance_id: ordonnance_id || null,
        montant, devise: 'MAD', methode: 'virement', statut: 'en_attente_virement',
        reference_virement: ref, created_at: new Date().toISOString(),
      }]).catch(() => {});
      return res.json({
        method: 'virement', reference: ref,
        iban: process.env.BANK_IBAN || 'MA64 0000 0000 0000 0000 0000 00',
        swift: process.env.BANK_SWIFT || 'BCMAMAMC',
        montant, devise: 'MAD', validite: '72h',
      });
    }

    // Generic (payzone, wafacash, edahabia, cash)
    const ref = 'SC-' + methode.toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    res.json({ method: methode, reference: ref, montant, devise: 'MAD', message: 'Paiement initié' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CMI CALLBACK ──────────────────────────────────────────────
app.post('/api/paiements/callback/cmi', async (req, res) => {
  const { oid, Response } = req.body;
  if (Response === 'Approved') {
    await supabase.from('transactions').update({ statut: 'payee', paid_at: new Date().toISOString() }).eq('id', oid).catch(() => {});
    console.log('[CMI] Paiement approuvé:', oid);
  } else {
    await supabase.from('transactions').update({ statut: 'echec' }).eq('id', oid).catch(() => {});
  }
  res.send('OK');
});

// ── WHATSAPP TEST ─────────────────────────────────────────────
app.post('/api/notify/test', async (req, res) => {
  const { tel, role } = req.body;
  if (!tel) return res.status(400).json({ error: 'Numéro requis' });
  const labels = { patient: 'Patient', pharmacie: 'Pharmacie', labo: 'Laboratoire', medecin: 'Médecin' };
  const r = await wa.send(tel, wa.tpl.test(labels[role] || role));
  res.json(r);
});

// ── ORDONNANCES LIST ──────────────────────────────────────────
app.get('/api/ordonnances', async (req, res) => {
  const { pharmacie_id, labo_id, statut, limit = 20 } = req.query;
  let q = supabase.from('ordonnances').select(`
    *, medecins(*), patients(*), pharmacies(*), laboratoires(*),
    medicaments_prescrits(*), analyses_prescrites(*)
  `).order('created_at', { ascending: false }).limit(Number(limit));
  if (pharmacie_id) q = q.eq('pharmacie_id', pharmacie_id);
  if (labo_id) q = q.eq('labo_id', labo_id);
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── STATIC FALLBACK ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🏥 SantéConnect v3 — Powered by Vita Tech');
  console.log(`🌐 Domain  : https://vita-core.org`);
  console.log(`📡 API     : http://localhost:${PORT}/api`);
  console.log(`📦 Supabase: ${process.env.SUPABASE_URL ? '✅' : '⚠ Non configuré'}`);
  console.log(`💬 WhatsApp: ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '⚠ Non configuré'}`);
  console.log(`💳 CMI     : ${process.env.CMI_CLIENT_ID ? '✅' : '⚠ Non configuré'}\n`);
});

module.exports = app;
