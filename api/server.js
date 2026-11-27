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
const { serveDocumentAsset } = require('../lib/document-assets');
const { evidenceHandler } = require('../lib/evidence');
const { generateRecoveryCode, resetPassword, changePassword } = require('../lib/account-security');
const { getWorkspace, evidenceTopics } = require('../lib/evidence-topics');
const team = require('../lib/doctor-team');
const { isTeamRole, isEmailRequiredForRole, hashPassword, comparePassword, signToken, requireAuth, requireRole } = require('../lib/auth');

// Reserve the administrative username for operator-managed accounts.
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const PUBLIC_ROLES = ['medecin', 'patient', 'labo', 'pharmacie', 'assurance'];

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

app.get('/api/document-assets/:asset', serveDocumentAsset);

// ── RATE LIMITING ─────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 5, skipSuccessfulRequests: true }));
app.use('/api/paiements/', rateLimit({ windowMs: 60*60*1000, max: 10 }));

function evidenceNoCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

function requireEvidenceAccount(req, res, next) {
  if (!getWorkspace(req.user.role)) return res.status(403).json({ error: 'role_not_allowed' });
  next();
}

app.get('/api/evidence/topics', evidenceNoCache, requireAuth, requireDatabase, requireEvidenceAccount, evidenceTopics);

app.all('/api/evidence',
  evidenceNoCache, requireAuth, requireDatabase, requireEvidenceAccount,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false }),
  evidenceHandler());

function requireDatabase(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Service momentanément indisponible.' });
  next();
}

function requireAccountService(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!supabase || !process.env.JWT_SECRET?.trim()) {
    return res.status(503).json({ error: 'Service des comptes momentanément indisponible. Vous pouvez continuer sans compte.' });
  }
  next();
}

// ── STATUS ────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const { error } = supabase ? await supabase.from('ordonnances').select('id', { head: true }).limit(1) : { error: true };
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

function excludeTeamAccounts(req, res, next) {
  if (isTeamRole(req.user.role)) return res.status(403).json({ error: 'Accès réservé aux comptes habilités.' });
  next();
}

// ── LISTS ─────────────────────────────────────────────────────
app.get('/api/pharmacies', requireAuth, excludeTeamAccounts, requireDatabase, async (req, res) => {
  const { data, error } = await supabase.from('pharmacies').select('*').order('nom');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/laboratoires', requireAuth, excludeTeamAccounts, requireDatabase, async (req, res) => {
  const { data, error } = await supabase.from('laboratoires').select('*').order('nom');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── SEND ORDONNANCE ───────────────────────────────────────────
app.post('/api/ordonnances', requireAuth, requireRole('medecin', 'super_admin'), requireDatabase, async (req, res) => {
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
app.post('/api/confirmations/pharmacie', requireAuth, requireRole('pharmacie', 'super_admin'), requireDatabase, async (req, res) => {
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
app.post('/api/confirmations/labo', requireAuth, requireRole('labo', 'super_admin'), requireDatabase, async (req, res) => {
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
app.post('/api/assurances/verifier', requireAuth, excludeTeamAccounts, requireDatabase, async (req, res) => {
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
app.post('/api/paiements/initier', requireAuth, excludeTeamAccounts, requireDatabase, async (req, res) => {
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
app.post('/api/paiements/callback/cmi', requireDatabase, async (req, res) => {
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
app.post('/api/notify/test', requireAuth, excludeTeamAccounts, async (req, res) => {
  const { tel, role } = req.body;
  if (!tel) return res.status(400).json({ error: 'Numéro requis' });
  const labels = { patient: 'Patient', pharmacie: 'Pharmacie', labo: 'Laboratoire', medecin: 'Médecin' };
  const r = await wa.send(tel, wa.tpl.test(labels[role] || role));
  res.json(r);
});

// ── ORDONNANCES LIST ──────────────────────────────────────────
app.get('/api/ordonnances', requireAuth, requireRole('super_admin'), requireDatabase, async (req, res) => {
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

// ── AUTH: REGISTER ────────────────────────────────────────────
app.post('/api/auth/register', requireAccountService, async (req, res) => {
  const { username: rawUsername, password, role, email: rawEmail, nom, prenom, telephone, profile } = req.body || {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';

  if (!username || typeof password !== 'string' || !PUBLIC_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Vérifiez le nom d’utilisateur, le mot de passe et le rôle.' });
  }
  if (username.toLowerCase() === SUPERADMIN_USERNAME.trim().toLowerCase()) {
    return res.status(400).json({ error: 'Ce nom d’utilisateur n’est pas disponible.' });
  }
  if (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Choisissez un mot de passe de 6 caractères minimum et de 72 octets maximum.' });
  }
  if (isEmailRequiredForRole(role) && !email) {
    return res.status(400).json({ error: 'L’email est obligatoire pour ce type de compte.' });
  }

  const profileName = profile?.nom || nom;
  if (role === 'medecin' && (!nom || !prenom)) {
    return res.status(400).json({ error: 'Le nom et le prénom du médecin sont obligatoires.' });
  }
  const profileTables = { medecin: 'medecins', labo: 'laboratoires', pharmacie: 'pharmacies', assurance: 'assurances' };
  const table = profileTables[role];
  if (table && !profileName) {
    return res.status(400).json({ error: 'Renseignez le nom de votre établissement ou votre nom.' });
  }

  const id = crypto.randomUUID();
  let profileId = null;
  let stage = 'lookup';
  try {
    // Prepare the session before any write, so a bad JWT configuration cannot leave a new account behind.
    const token = signToken({ id, username, role });
    const { data: existing, error: lookupError } = await supabase.from('users')
      .select('id').eq('username', username).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris.' });
    const password_hash = await hashPassword(password);

    if (table) {
      stage = 'profile';
      const values = role === 'medecin'
        ? { nom, prenom, titre: profile?.titre || 'generaliste', cabinet: profile?.cabinet || profileName,
          ville: profile?.ville || '', telephone: telephone || '', email: email || null }
        : { nom: profileName, adresse: profile?.adresse || null, ville: profile?.ville || null, telephone: telephone || null };
      const { data, error } = await supabase.from(table).insert(values).select('id').single();
      if (error) throw error;
      profileId = data.id;
    }

    stage = 'account';
    const { data: user, error } = await supabase.from('users').insert({
      id, username, email: email || null, password_hash, role,
      nom: nom || null, prenom: prenom || null, telephone: telephone || null, profile_id: profileId,
    }).select('id, username, email, role, nom, prenom, telephone').single();
    if (error) throw error;
    return res.status(201).json({ token, user });
  } catch (err) {
    // Delete only a profile we just created, and only when Postgres definitively rejected the account write.
    if (profileId && stage === 'account' && /^[0-9A-Z]{5}$/.test(err.code || '')) {
      const { error: cleanupError } = await supabase.from(table).delete().eq('id', profileId);
      if (cleanupError) console.error('[register] profile cleanup failed', cleanupError.code || 'unknown');
    }
    if (stage === 'account' && err.code === '23505') {
      return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris.' });
    }
    console.error('[register]', stage, err.code || 'unavailable');
    return res.status(503).json({ error: 'Inscription momentanément indisponible. Vous pouvez continuer sans compte.' });
  }
});


// ── AUTH: LOGIN ───────────────────────────────────────────────
app.post('/api/auth/login', requireAccountService, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis.' });

  try {
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
    if (error) throw error;
    if (!user || !user.is_active) return res.status(401).json({ error: 'Identifiants invalides.' });

    if (isTeamRole(user.role)) {
      const owner = await supabase.from('users').select('id').eq('id', user.team_owner_id)
        .eq('is_active', true).eq('role', 'medecin').maybeSingle();
      if (owner.error) throw owner.error;
      if (!owner.data) return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides.' });

    const publicUser = { id: user.id, username: user.username, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, telephone: user.telephone };
    const token = signToken(user);
    res.json({ token, user: publicUser });
  } catch (err) {
    console.error('[login]', err.code || 'unavailable');
    res.status(503).json({ error: 'Connexion momentanément indisponible. Vous pouvez continuer sans compte.' });
  }
});

app.post('/api/auth/recovery-code', requireAccountService, requireAuth, generateRecoveryCode);
app.post('/api/auth/reset-password', requireAccountService, resetPassword);
app.post('/api/auth/change-password', requireAccountService, requireAuth, changePassword);

function doctorTeamAction(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch {
      res.status(503).json({ error: 'Gestion de l’équipe momentanément indisponible.' });
    }
  };
}

app.post('/api/auth/team-accept', requireAccountService, doctorTeamAction(team.accept));
app.get('/api/team', evidenceNoCache, requireAuth, requireRole('medecin'), doctorTeamAction(team.list));
app.post('/api/team', evidenceNoCache, requireAuth, requireRole('medecin'), doctorTeamAction(team.invite));
app.patch('/api/team/:id', evidenceNoCache, requireAuth, requireRole('medecin'), doctorTeamAction(team.update));

// ── AUTH: ME ──────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, requireDatabase, async (req, res) => {
  const { data: user, error } = await supabase.from('users')
    .select('id, username, email, role, nom, prenom, telephone').eq('id', req.user.sub).eq('is_active', true).maybeSingle();
  if (error) return res.status(503).json({ error: 'Service des comptes momentanément indisponible.' });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user });
});

// ── ASSURANCE QUEUE (role: assurance / super_admin) ───────────
app.get('/api/assurances/queue', requireAuth, requireDatabase, requireRole('assurance', 'super_admin'), async (req, res) => {
  const { data, error } = await supabase.from('assurance_queue')
    .select('*, patients(nom, prenom, telephone)').order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── ADMIN: PERMISSIONS MATRIX (Super Admin) ──────────────────
app.get('/api/admin/permissions', requireAuth, requireRole('super_admin'), requireDatabase, async (req, res) => {
  const { data, error } = await supabase.from('role_permissions').select('*').order('role');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/admin/permissions/:role', requireAuth, requireRole('super_admin'), requireDatabase, async (req, res) => {
  const { role } = req.params;
  const allowed = ['can_view_ordonnances', 'can_view_patients', 'can_view_pharmacies', 'can_view_laboratoires', 'can_view_assurances', 'can_view_transactions', 'can_manage_users'];
  const updates = {};
  for (const key of allowed) if (key in req.body) updates[key] = !!req.body[key];
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('role_permissions').update(updates).eq('role', role).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── ADMIN: USER LIST (Super Admin) ────────────────────────────
app.get('/api/admin/users', requireAuth, requireRole('super_admin'), requireDatabase, async (req, res) => {
  const { data, error } = await supabase.from('users')
    .select('id, username, email, role, nom, prenom, telephone, is_active, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/admin/users/:id', requireAuth, requireRole('super_admin'), requireDatabase, async (req, res) => {
  const { role, is_active } = req.body;
  const updates = {};
  if (role && PUBLIC_ROLES.includes(role)) updates.role = role;
  if (typeof is_active === 'boolean') updates.is_active = is_active;

  const { data, error } = await supabase.from('users').update(updates).eq('id', req.params.id)
    .select('id, username, email, role, is_active').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── STATIC FALLBACK ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => {
  console.log('\n🏥 SantéConnect v3 — Powered by Vita Tech');
  console.log(`🌐 Domain  : https://vita-core.org`);
  console.log(`📡 API     : http://localhost:${PORT}/api`);
  console.log(`📦 Supabase: ${supabase ? '✅' : '⚠ Non configuré'}`);
  console.log(`💬 WhatsApp: ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '⚠ Non configuré'}`);
  console.log(`💳 CMI     : ${process.env.CMI_CLIENT_ID ? '✅' : '⚠ Non configuré'}\n`);
});

module.exports = app;
