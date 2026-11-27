// lib/auth.js — SantéConnect v3 by Vita Tech
// Password hashing, JWT issuance/verification, and auth middleware.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { supabase } = require('./supabase');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '30d';

// Roles that represent a professional/business account — email is mandatory for these.
const EMAIL_REQUIRED_ROLES = new Set(['medecin', 'labo', 'assurance']);

function isTeamRole(role) {
  return role === 'assistant' || role === 'infirmier';
}

function isEmailRequiredForRole(role) {
  return EMAIL_REQUIRED_ROLES.has(role);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, sv: user.session_version ?? 0 },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware: requires a valid bearer token, attaches req.user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  let session;
  try {
    session = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
  try {
    if (!supabase) throw new Error('Database unavailable');
    const { data: account, error } = await supabase.from('users')
      .select('role, session_version, team_owner_id').eq('id', session.sub).eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (!account || account.role !== session.role || account.session_version !== (session.sv ?? 0)) {
      return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
    }
    if (isTeamRole(account.role)) {
      const { data: owner, error: ownerError } = await supabase.from('users').select('id')
        .eq('id', account.team_owner_id).eq('role', 'medecin').eq('is_active', true).maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner) return res.status(403).json({ error: 'Le compte du médecin est indisponible.' });
    }
    req.user = { ...session, teamOwnerId: account.team_owner_id };
    next();
  } catch {
    return res.status(503).json({ error: 'Service des comptes momentanément indisponible.' });
  }
}

// Express middleware factory: requires req.user.role to be one of the given roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
    next();
  };
}

module.exports = {
  isEmailRequiredForRole,
  isTeamRole,
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  requireAuth,
  requireRole,
};
