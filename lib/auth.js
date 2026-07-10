// lib/auth.js — SantéConnect v3 by Vita Tech
// Password hashing, JWT issuance/verification, and auth middleware.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '30d';

// Roles that represent a professional/business account — email is mandatory for these.
const EMAIL_REQUIRED_ROLES = new Set(['medecin', 'labo', 'assurance']);

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
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware: requires a valid bearer token, attaches req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
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
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  requireAuth,
  requireRole,
};
