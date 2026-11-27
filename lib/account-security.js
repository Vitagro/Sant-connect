const crypto = require('node:crypto');
const { supabase } = require('./supabase');
const { comparePassword, hashPassword } = require('./auth');

const accountColumns = 'id, password_hash, session_version, recovery_code_hash';
const invalidCode = 'Nom d’utilisateur ou code de récupération invalide ou expiré.';
const unavailable = 'Sécurité du compte momentanément indisponible.';

function digest(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function passwordFits(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72;
}

function newPasswordFits(value) {
  return passwordFits(value) && value.length >= 10;
}

function activeAccount() {
  return supabase.from('users').select(accountColumns).eq('is_active', true);
}

function updateAccount(account, fields) {
  return supabase.from('users').update(fields).eq('id', account.id)
    .eq('is_active', true).eq('session_version', account.session_version);
}

async function accountForSession(req) {
  const { data, error } = await activeAccount().eq('id', req.user.sub)
    .eq('session_version', req.user.sv ?? 0).maybeSingle();
  if (error) throw error;
  const password = req.body?.currentPassword;
  if (!data || !passwordFits(password) || !await comparePassword(password, data.password_hash)) return null;
  return data;
}

function lockRecoveryCode(request, previous) {
  return previous === null ? request.is('recovery_code_hash', null) : request.eq('recovery_code_hash', previous);
}

async function generateRecoveryCode(req, res) {
  try {
    const account = await accountForSession(req);
    if (!account) return res.status(400).json({ error: 'Le mot de passe actuel est incorrect.' });
    const code = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const update = updateAccount(account, { recovery_code_hash: digest(code), recovery_expires_at: expiresAt });
    const { data, error } = await lockRecoveryCode(update, account.recovery_code_hash).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Le compte a changé. Réessayez.' });
    return res.json({ code, expiresAt });
  } catch {
    return res.status(503).json({ error: unavailable });
  }
}

async function updatePassword(account, password, recoveryHash) {
  const hash = await hashPassword(password);
  let update = updateAccount(account, {
    password_hash: hash,
    recovery_code_hash: null,
    recovery_expires_at: null,
    session_version: account.session_version + 1,
  });
  if (recoveryHash) update = update.eq('recovery_code_hash', recoveryHash)
    .gt('recovery_expires_at', new Date().toISOString());
  const { data, error } = await update.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function resetPassword(req, res) {
  const { username, code, newPassword } = req.body || {};
  if (!newPasswordFits(newPassword)) {
    return res.status(400).json({ error: 'Choisissez entre 10 caractères minimum et 72 octets maximum.' });
  }
  if (typeof username !== 'string' || !username.trim() || username.length > 255 ||
      typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code.trim())) {
    return res.status(400).json({ error: invalidCode });
  }
  try {
    const recoveryHash = digest(code.trim());
    const { data: account, error } = await activeAccount().eq('username', username.trim())
      .eq('recovery_code_hash', recoveryHash).gt('recovery_expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!account || !await updatePassword(account, newPassword, recoveryHash)) {
      return res.status(400).json({ error: invalidCode });
    }
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: unavailable });
  }
}

async function changePassword(req, res) {
  const password = req.body?.newPassword;
  if (!newPasswordFits(password)) {
    return res.status(400).json({ error: 'Choisissez entre 10 caractères minimum et 72 octets maximum.' });
  }
  if (password === req.body.currentPassword) {
    return res.status(400).json({ error: 'Choisissez un mot de passe différent de l’actuel.' });
  }
  try {
    const account = await accountForSession(req);
    if (!account) return res.status(400).json({ error: 'Le mot de passe actuel est incorrect.' });
    if (!await updatePassword(account, password)) {
      return res.status(409).json({ error: 'Le compte a changé. Reconnectez-vous.' });
    }
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: unavailable });
  }
}

module.exports = { changePassword, generateRecoveryCode, resetPassword };
