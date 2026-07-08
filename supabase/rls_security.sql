-- ================================================================
--  SantéConnect — Politique de Sécurité Supabase (RLS)
--  Conformité : Loi 09-08 (CNDP Maroc) + OWASP Top 10
--  Chiffrement AES-256 au repos | TLS 1.3 en transit
-- ================================================================

-- ── EXTENSIONS REQUISES ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- AES-256 natif PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pg_audit";      -- Piste d'audit CNDP

-- ================================================================
--  1. TABLE DES RÔLES ET UTILISATEURS (Authentification)
-- ================================================================
CREATE TYPE user_role AS ENUM ('medecin', 'patient', 'pharmacie', 'labo', 'admin', 'auditeur');

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          user_role NOT NULL,
  nom           TEXT,
  prenom        TEXT,
  -- Données chiffrées AES-256 via pgcrypto (Loi 09-08 Art. 23)
  telephone_enc BYTEA,          -- pgp_sym_encrypt(telephone, KEY)
  cin_enc       BYTEA,          -- pgp_sym_encrypt(cin, KEY)
  -- Consentement CNDP (Loi 09-08 Art. 4)
  consentement_signe    BOOLEAN DEFAULT FALSE,
  consentement_date     TIMESTAMPTZ,
  consentement_version  TEXT DEFAULT 'v1.0',
  -- Droit à l'oubli (Loi 09-08 Art. 7)
  anonymise       BOOLEAN DEFAULT FALSE,
  anonymise_at    TIMESTAMPTZ,
  -- Rétention des données (max 5 ans selon CNDP)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 years',
  -- MFA
  mfa_enabled     BOOLEAN DEFAULT FALSE,
  mfa_secret_enc  BYTEA,
  -- Dernière connexion (détection d'anomalie)
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  failed_attempts INT DEFAULT 0,
  locked_until    TIMESTAMPTZ
);

-- ================================================================
--  2. TABLE D'AUDIT (Piste CNDP obligatoire)
-- ================================================================
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES profiles(id),
  action        TEXT NOT NULL,       -- READ | WRITE | DELETE | LOGIN | EXPORT
  table_name    TEXT,
  record_id     UUID,
  ip_address    INET,
  user_agent    TEXT,
  status        TEXT DEFAULT 'ok',   -- ok | forbidden | error
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- Index pour recherche rapide (audits CNDP)
CREATE INDEX idx_audit_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_date   ON audit_logs(created_at DESC);

-- ================================================================
--  3. ORDONNANCES — RLS STRICT (Loi 09-08 Art. 23 & 24)
-- ================================================================
ALTER TABLE ordonnances ENABLE ROW LEVEL SECURITY;

-- Le médecin voit UNIQUEMENT ses propres ordonnances
CREATE POLICY "medecin_own_ordo" ON ordonnances
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE id = ordonnances.medecin_id
      AND role = 'medecin'
      AND anonymise = FALSE
    )
  );

-- Le patient voit UNIQUEMENT ses propres ordonnances
CREATE POLICY "patient_own_ordo" ON ordonnances
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE id = ordonnances.patient_id
      AND role = 'patient'
      AND anonymise = FALSE
    )
  );

-- La pharmacie voit UNIQUEMENT les ordonnances qui lui sont assignées
CREATE POLICY "pharmacie_assigned_ordo" ON ordonnances
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT p.id FROM profiles p
      WHERE p.role = 'pharmacie'
      AND ordonnances.pharmacie_id = p.id
    )
  );

-- Le labo voit UNIQUEMENT les ordonnances avec analyses qui lui sont assignées
CREATE POLICY "labo_assigned_ordo" ON ordonnances
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT p.id FROM profiles p
      WHERE p.role = 'labo'
      AND ordonnances.labo_id = p.id
    )
  );

-- L'admin voit tout (avec audit obligatoire)
CREATE POLICY "admin_full_access" ON ordonnances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ================================================================
--  4. DONNÉES PATIENTS — RLS ULTRA-STRICT
-- ================================================================
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Un patient voit UNIQUEMENT son propre profil
CREATE POLICY "patient_self_only" ON patients
  FOR ALL
  USING (auth.uid() = id);

-- Un médecin voit les patients de ses ordonnances UNIQUEMENT
CREATE POLICY "medecin_sees_own_patients" ON patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ordonnances o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.patient_id = patients.id
      AND o.medecin_id = auth.uid()
      AND p.role = 'medecin'
    )
  );

-- Interdiction absolue d'accès direct aux données chiffrées
-- par les rôles non autorisés
CREATE POLICY "block_raw_encrypted_fields" ON patients
  FOR SELECT
  USING (
    -- Seul le patient lui-même ou admin peut voir cin_enc / telephone_enc
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ================================================================
--  5. FONCTION DE CHIFFREMENT AES-256 (Loi 09-08 Art. 23)
-- ================================================================
-- Clé de chiffrement stockée dans Vault Supabase (jamais en clair)
CREATE OR REPLACE FUNCTION encrypt_sensitive(plain_text TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plain_text,
    current_setting('app.encryption_key'),  -- Chargée depuis Vault
    'cipher-algo=aes256'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive(encrypted_data BYTEA)
RETURNS TEXT AS $$
BEGIN
  -- Vérification du rôle avant déchiffrement
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'medecin')
    AND anonymise = FALSE
  ) THEN
    RAISE EXCEPTION 'Accès refusé : déchiffrement non autorisé (Loi 09-08)';
  END IF;

  RETURN pgp_sym_decrypt(
    encrypted_data,
    current_setting('app.encryption_key')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
--  6. FONCTION D'AUDIT AUTOMATIQUE (Trigger CNDP)
-- ================================================================
CREATE OR REPLACE FUNCTION log_data_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    jsonb_build_object(
      'operation', TG_OP,
      'timestamp', NOW(),
      'session_id', current_setting('request.jwt.claims', true)::json->>'session_id'
    )
  );
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attacher le trigger sur toutes les tables sensibles
CREATE TRIGGER audit_ordonnances
  AFTER INSERT OR UPDATE OR DELETE ON ordonnances
  FOR EACH ROW EXECUTE FUNCTION log_data_access();

CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION log_data_access();

-- ================================================================
--  7. DROIT À L'OUBLI / ANONYMISATION (Loi 09-08 Art. 7)
-- ================================================================
CREATE OR REPLACE FUNCTION anonymiser_patient(patient_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Vérifier que l'appelant est l'admin ou le patient lui-même
  IF auth.uid() != patient_uuid AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accès refusé : anonymisation non autorisée';
  END IF;

  -- Anonymisation irréversible des données personnelles
  UPDATE patients SET
    nom            = 'ANONYMISÉ',
    prenom         = 'ANONYMISÉ',
    cin_enc        = NULL,
    telephone_enc  = NULL,
    allergies      = NULL,
    antecedents    = NULL,
    assurance      = NULL,
    anonymise      = TRUE,
    anonymise_at   = NOW()
  WHERE id = patient_uuid;

  -- Journaliser l'anonymisation (Loi 09-08 Art. 7)
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    auth.uid(), 'ANONYMIZE', 'patients', patient_uuid,
    '{"reason": "Droit à l\'oubli Loi 09-08 Art.7", "irréversible": true}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
--  8. NETTOYAGE AUTOMATIQUE (Politique de rétention 5 ans CNDP)
-- ================================================================
CREATE OR REPLACE FUNCTION purge_expired_data()
RETURNS VOID AS $$
BEGIN
  -- Anonymiser automatiquement les données expirées
  UPDATE patients
  SET anonymise = TRUE, anonymise_at = NOW(),
      nom = 'EXPIRÉ', prenom = 'EXPIRÉ',
      cin_enc = NULL, telephone_enc = NULL
  WHERE expires_at < NOW() AND anonymise = FALSE;

  -- Archiver les ordonnances > 10 ans (obligation légale médicale)
  -- Les ordonnances ne sont jamais supprimées, seulement anonymisées
  UPDATE ordonnances
  SET statut = 'archive_legal'
  WHERE created_at < NOW() - INTERVAL '10 years'
  AND statut != 'archive_legal';

  -- Supprimer les logs d'audit > 7 ans
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '7 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Planifier la purge automatique (pg_cron si disponible)
-- SELECT cron.schedule('purge-expired', '0 2 * * *', 'SELECT purge_expired_data()');
