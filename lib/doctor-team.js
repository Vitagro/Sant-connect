const crypto = require('node:crypto');
const { supabase } = require('./supabase');
const { hashPassword, isTeamRole } = require('./auth');

const fields = 'id, username, nom, prenom, role, is_active, team_invite_expires_at, team_activated_at';
const roles = ['assistant', 'infirmier'];
const unavailable = 'Gestion de l’équipe momentanément indisponible.';
const invalidInvite = 'Identifiant ou code d’invitation invalide ou expiré.';
const hash = code => crypto.createHash('sha256').update(code).digest('hex');

function invitation() {
  const code = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  return { code, fields: { team_invite_hash: hash(code), team_invite_expires_at: expires } };
}

function owned(req, operation) {
  return operation.eq('team_owner_id', req.user.sub).in('role', roles);
}

async function list(req, res) {
  const { data, error } = await owned(req, supabase.from('users').select(fields)).order('created_at', { ascending: false });
  return error ? res.status(503).json({ error: unavailable }) : res.json(data);
}

async function invite(req, res) {
  const { role, username: raw, nom, prenom } = req.body || {};
  const username = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!isTeamRole(role) || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ||
      username === (process.env.SUPERADMIN_USERNAME || 'superadmin').trim().toLowerCase() ||
      [nom, prenom].some(value => value != null && (typeof value !== 'string' || value.length > 80))) {
    return res.status(400).json({ error: 'Choisissez un rôle et un identifiant de 3 à 32 caractères (lettres, chiffres, point, tiret ou soulignement).' });
  }
  const next = invitation();
  const { data, error } = await supabase.from('users').insert({
    username, role, nom: nom?.trim() || null, prenom: prenom?.trim() || null, team_owner_id: req.user.sub,
    is_active: false, password_hash: '!invitation', ...next.fields,
  }).select(fields).single();
  if (error?.code === '23505') return res.status(409).json({ error: 'Cet identifiant est déjà utilisé.' });
  if (error) return res.status(503).json({ error: unavailable });
  return res.status(201).json({ member: data, code: next.code });
}

async function update(req, res) {
  const action = req.body?.action;
  if (!['renew', 'revoke', 'enable', 'disable'].includes(action) ||
      !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Action invalide.' });
  const pending = action === 'renew' || action === 'revoke';
  const next = action === 'renew' ? invitation() : null;
  let patch;
  if (pending) patch = next ? next.fields : { team_invite_hash: null, team_invite_expires_at: null };
  else patch = { is_active: action === 'enable' };
  let command = owned(req, supabase.from('users').update(patch)).eq('id', req.params.id);
  if (pending) command = command.is('team_activated_at', null);
  else {
    const { data: member, error } = await owned(req, supabase.from('users').select('session_version'))
      .eq('id', req.params.id).not('team_activated_at', 'is', null).maybeSingle();
    if (error) return res.status(503).json({ error: unavailable });
    if (!member) return res.status(404).json({ error: 'Membre introuvable.' });
    patch.session_version = member.session_version + 1;
    command = owned(req, supabase.from('users').update(patch)).eq('id', req.params.id)
      .not('team_activated_at', 'is', null).eq('session_version', member.session_version);
  }
  const { data, error } = await command.select(fields).maybeSingle();
  if (error) return res.status(503).json({ error: unavailable });
  if (!data) return res.status(404).json({ error: 'Membre introuvable ou accès modifié.' });
  return res.json(next ? { member: data, code: next.code } : { member: data });
}

async function accept(req, res) {
  const { username, code, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Choisissez un mot de passe de 10 caractères minimum et de 72 octets maximum.' });
  }
  if (typeof username !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(username.trim()) ||
      typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code.trim())) return res.status(400).json({ error: invalidInvite });
  const now = new Date().toISOString();
  const digest = hash(code.trim());
  const pending = query => query.eq('username', username.trim().toLowerCase()).in('role', roles)
    .is('team_activated_at', null).eq('is_active', false).eq('team_invite_hash', digest).gt('team_invite_expires_at', now);
  const { data: member, error } = await pending(supabase.from('users').select('id, team_owner_id')).maybeSingle();
  if (error) return res.status(503).json({ error: unavailable });
  if (!member) return res.status(400).json({ error: invalidInvite });
  const owner = await supabase.from('users').select('id').eq('id', member.team_owner_id).eq('role', 'medecin').eq('is_active', true).maybeSingle();
  if (owner.error) return res.status(503).json({ error: unavailable });
  if (!owner.data) return res.status(400).json({ error: invalidInvite });
  const password_hash = await hashPassword(password);
  const result = await pending(supabase.from('users').update({
    password_hash, is_active: true, team_activated_at: new Date().toISOString(),
    team_invite_hash: null, team_invite_expires_at: null,
  })).eq('id', member.id).select('id').maybeSingle();
  if (result.error) return res.status(503).json({ error: unavailable });
  if (!result.data) return res.status(400).json({ error: invalidInvite });
  return res.json({ success: true });
}

module.exports = { list, invite, update, accept };
