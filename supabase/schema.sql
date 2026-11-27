-- ================================================================
--  SantéConnect v3 — Schéma Supabase
--  Powered by Vita Tech | vita-core.org
--  Exécuter dans : Supabase Dashboard > SQL Editor > New Query
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── MÉDECINS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medecins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  titre       TEXT NOT NULL,
  inpe        TEXT,
  rpps        TEXT,
  cabinet     TEXT NOT NULL,
  adresse     TEXT,
  ville       TEXT NOT NULL,
  telephone   TEXT NOT NULL,
  email       TEXT,
  assurance   TEXT,
  specialty   TEXT DEFAULT 'generaliste',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PATIENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom          TEXT NOT NULL,
  prenom       TEXT NOT NULL,
  dob          DATE NOT NULL,
  cin          TEXT,
  telephone    TEXT NOT NULL,
  sexe         TEXT,
  poids        NUMERIC,
  taille       NUMERIC,
  allergies    TEXT,
  antecedents  TEXT,
  assurance    TEXT,
  region       TEXT,
  ville        TEXT,
  pharmacie_pref TEXT,
  labo_pref    TEXT,
  anonymise    BOOLEAN DEFAULT FALSE,
  anonymise_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 years'
);

-- ── PHARMACIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacies (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom       TEXT NOT NULL,
  adresse   TEXT,
  ville     TEXT,
  telephone TEXT,
  heures    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── LABORATOIRES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS laboratoires (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom       TEXT NOT NULL,
  adresse   TEXT,
  ville     TEXT,
  telephone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ASSURANCES (compte compagnie d'assurance) ─────────────────
CREATE TABLE IF NOT EXISTS assurances (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom       TEXT NOT NULL,
  adresse   TEXT,
  ville     TEXT,
  telephone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── UTILISATEURS (authentification) ───────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  recovery_code_hash TEXT,
  recovery_expires_at TIMESTAMPTZ,
  role          TEXT NOT NULL CHECK (role IN ('medecin','patient','labo','pharmacie','assurance','super_admin')),
  nom           TEXT,
  prenom        TEXT,
  telephone     TEXT,
  profile_id    UUID,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ── PERMISSIONS PAR RÔLE (gérées par le Super Admin) ──────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role                    TEXT PRIMARY KEY,
  can_view_ordonnances    BOOLEAN DEFAULT FALSE,
  can_view_patients       BOOLEAN DEFAULT FALSE,
  can_view_pharmacies     BOOLEAN DEFAULT FALSE,
  can_view_laboratoires   BOOLEAN DEFAULT FALSE,
  can_view_assurances     BOOLEAN DEFAULT FALSE,
  can_view_transactions   BOOLEAN DEFAULT FALSE,
  can_manage_users        BOOLEAN DEFAULT FALSE,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── ORDONNANCES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordonnances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medecin_id    UUID REFERENCES medecins(id),
  patient_id    UUID REFERENCES patients(id),
  pharmacie_id  UUID REFERENCES pharmacies(id),
  labo_id       UUID REFERENCES laboratoires(id),
  diagnostic    TEXT NOT NULL,
  notes         TEXT,
  date_ordo     DATE DEFAULT CURRENT_DATE,
  lieu          TEXT,
  signature_b64 TEXT,
  statut        TEXT DEFAULT 'envoyee',
  specialty     TEXT DEFAULT 'generaliste',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── MÉDICAMENTS PRESCRITS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicaments_prescrits (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordonnance_id  UUID REFERENCES ordonnances(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  dosage         TEXT,
  frequence      TEXT,
  duree          TEXT,
  condition_util TEXT,
  moment         TEXT,
  notes          TEXT,
  ordre          INT DEFAULT 1
);

-- ── ANALYSES PRESCRITES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyses_prescrites (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordonnance_id UUID REFERENCES ordonnances(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  urgence       TEXT DEFAULT 'Normal',
  instructions  TEXT
);

-- ── CONFIRMATIONS PHARMACIE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS confirmations_pharmacie (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordonnance_id      UUID REFERENCES ordonnances(id),
  pharmacie_id       UUID REFERENCES pharmacies(id),
  statut             TEXT DEFAULT 'en_attente',
  prix_total         NUMERIC,
  medicaments_dispo  TEXT[],
  medicaments_manq   TEXT[],
  message            TEXT,
  confirmed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONFIRMATIONS LABORATOIRE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS confirmations_labo (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordonnance_id UUID REFERENCES ordonnances(id),
  labo_id       UUID REFERENCES laboratoires(id),
  statut        TEXT DEFAULT 'en_attente',
  rdv_date      DATE,
  rdv_heure     TEXT,
  instructions  TEXT,
  jeun_requis   BOOLEAN DEFAULT FALSE,
  message       TEXT,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── TRANSACTIONS PAIEMENT ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  ordonnance_id       UUID REFERENCES ordonnances(id),
  montant             NUMERIC NOT NULL,
  devise              TEXT DEFAULT 'MAD',
  methode             TEXT NOT NULL,
  statut              TEXT DEFAULT 'pending',
  reference_virement  TEXT,
  response_gateway    TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ
);

-- ── FILE ASSURANCES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assurance_queue (
  id              TEXT PRIMARY KEY,
  patient_id      UUID REFERENCES patients(id),
  compagnie       TEXT NOT NULL,
  numero_police   TEXT,
  type_couverture TEXT,
  statut          TEXT DEFAULT 'en_attente',
  couverture_data JSONB,
  sla_deadline    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS WHATSAPP ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_wa (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordonnance_id UUID REFERENCES ordonnances(id),
  destinataire  TEXT NOT NULL,
  telephone     TEXT NOT NULL,
  message       TEXT NOT NULL,
  statut        TEXT DEFAULT 'envoye',
  twilio_sid    TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUDIT LOGS (Conformité Loi 09-08) ────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID,
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  TEXT,
  ip_address TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ordo_patient    ON ordonnances(patient_id);
CREATE INDEX IF NOT EXISTS idx_ordo_medecin    ON ordonnances(medecin_id);
CREATE INDEX IF NOT EXISTS idx_ordo_statut     ON ordonnances(statut);
CREATE INDEX IF NOT EXISTS idx_ordo_created    ON ordonnances(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meds_ordo       ON medicaments_prescrits(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_analyses_ordo   ON analyses_prescrites(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_conf_pha_ordo   ON confirmations_pharmacie(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_conf_lab_ordo   ON confirmations_labo(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_notif_ordo      ON notifications_wa(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_tx_ordo         ON transactions(ordonnance_id);
CREATE INDEX IF NOT EXISTS idx_audit_date      ON audit_logs(created_at DESC);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Toutes les tables métier sont protégées : RLS activé + une seule
-- politique, restreinte AU SEUL rôle service_role (TO service_role).
-- Sans ce "TO service_role", USING (true) s'applique à TOUS les rôles
-- Postgres — y compris anon, dont la clé publique est déjà exposée
-- dans le HTML du frontend (meta[name=supa-key]). Le backend Express
-- (clé service_role) est le seul point d'accès légitime aux données.
ALTER TABLE ordonnances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicaments_prescrits ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses_prescrites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmations_pharmacie ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmations_labo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_wa      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE medecins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE laboratoires          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurances            ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions      ENABLE ROW LEVEL SECURITY;

-- Politique service role = accès total (backend uniquement)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ordonnances','patients','medicaments_prescrits','analyses_prescrites',
    'confirmations_pharmacie','confirmations_labo','transactions','notifications_wa','assurance_queue',
    'medecins','pharmacies','laboratoires','audit_logs','assurances','users','role_permissions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_all ON %I', t);
    EXECUTE format('CREATE POLICY service_all ON %I FOR ALL TO service_role USING (true)', t);
  END LOOP;
END$$;

-- ── DONNÉES DE DÉMO ───────────────────────────────────────────
INSERT INTO pharmacies (nom, adresse, ville, telephone) VALUES
  ('Pharmacie Al Amal',   '14 Av. Mohammed VI, Guéliz', 'Marrakech', '0524123456'),
  ('Pharmacie Salam',     'Bd Zerktouni, Guéliz',       'Marrakech', '0524234567'),
  ('Pharmacie Atlas',     'Av. Hassan II',               'Casablanca','0522345678'),
  ('Pharmacie Riad',      'Rue Bab Agnaou',              'Marrakech', '0524456789'),
  ('Pharmacie Menara',    'Av. Menara',                  'Marrakech', '0524567890')
ON CONFLICT DO NOTHING;

INSERT INTO laboratoires (nom, adresse, ville, telephone) VALUES
  ('Laboratoire Pasteur',      '5 Rue Ibn Sina, Guéliz',   'Marrakech', '0524111222'),
  ('Labo BioAnalyse',          'Av. Mohammed V',            'Casablanca','0522333444'),
  ('Centre Analyses Razi',     'Bd Allal El Fassi',         'Rabat',     '0537555666'),
  ('Labo Guéliz',              '23 Rue de Yougoslavie',    'Marrakech', '0524777888'),
  ('Cabinet Radiologie Atlas', 'Av. des FAR',               'Marrakech', '0524999000')
ON CONFLICT DO NOTHING;

-- ── PERMISSIONS PAR DÉFAUT ─────────────────────────────────────
INSERT INTO role_permissions (role, can_view_ordonnances, can_view_patients, can_view_pharmacies, can_view_laboratoires, can_view_assurances, can_view_transactions, can_manage_users) VALUES
  ('medecin',     TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('patient',     FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE),
  ('labo',        FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE),
  ('pharmacie',   FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE),
  ('assurance',   FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE),
  ('super_admin', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE)
ON CONFLICT (role) DO NOTHING;
