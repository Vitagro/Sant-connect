// public/js/auth.js — SantéConnect v3 | Vita Tech
// Registration/login gate + Super Admin rights panel.

const EMAIL_REQUIRED_ROLES = new Set(['medecin', 'labo', 'assurance']);
let currentUser = null;

function authToken() { return localStorage.getItem('sc_token'); }
function setAuthToken(t) { t ? localStorage.setItem('sc_token', t) : localStorage.removeItem('sc_token'); }

async function apiAuthFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = authToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(window.API_BASE + path, Object.assign({}, options, { headers }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function switchAuthTab(tab) {
  document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('auth-error').textContent = '';
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('app-root').classList.add('locked');
}
function hideAuthOverlay() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app-root').classList.remove('locked');
}

function updateEmailRequirement() {
  const role = document.querySelector('#register-form input[name="role"]:checked')?.value;
  const emailInput = document.getElementById('reg-email');
  const emailLabel = document.getElementById('reg-email-label');
  const required = EMAIL_REQUIRED_ROLES.has(role);
  emailInput.required = required;
  emailLabel.textContent = 'Email' + (required ? ' *' : ' (facultatif)');
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const role = form.querySelector('input[name="role"]:checked')?.value;
  const payload = {
    username: form.username.value.trim(),
    password: form.password.value,
    role,
    email: form.email.value.trim() || undefined,
    nom: form.nom.value.trim() || undefined,
    prenom: form.prenom.value.trim() || undefined,
    telephone: form.telephone.value.trim() || undefined,
    profile: {
      nom: form.profile_nom.value.trim() || form.nom.value.trim(),
      ville: form.profile_ville.value.trim() || undefined,
    },
  };
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  try {
    const { token, user } = await apiAuthFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    setAuthToken(token);
    currentUser = user;
    onAuthSuccess();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  try {
    const { token, user } = await apiAuthFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
    });
    setAuthToken(token);
    currentUser = user;
    onAuthSuccess();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function onAuthSuccess() {
  hideAuthOverlay();
  document.getElementById('nav-logout').classList.remove('hidden');
  document.getElementById('nav-username').textContent = currentUser.username;
  document.getElementById('nav-username').classList.remove('hidden');

  const roleCards = document.querySelectorAll('.role-grid .role-card');
  if (currentUser.role === 'super_admin') {
    roleCards.forEach(c => c.style.display = '');
    const adminCard = document.querySelector('.role-card[data-role="superadmin"]');
    if (adminCard) adminCard.style.display = '';
    setRole('superadmin');
    loadSuperAdminPanel();
  } else {
    // Restrict the visible role cards to the account's own role — this is a real account, not a demo switcher.
    roleCards.forEach(c => { c.style.display = c.dataset.role === currentUser.role ? '' : 'none'; });
    setRole(currentUser.role);
    if (currentUser.role === 'assurance') loadAssuranceQueue();
  }
}

async function loadAssuranceQueue() {
  const el = document.getElementById('assurance-queue-table');
  try {
    const queue = await apiAuthFetch('/assurances/queue');
    if (!queue.length) { el.innerHTML = '<p style="color:var(--text-2);font-size:13px">Aucune demande en attente.</p>'; return; }
    el.innerHTML = `<table class="stock-table"><thead><tr>
      <th>Patient</th><th>Compagnie</th><th>N° Police</th><th>Statut</th><th>Créée le</th>
      </tr></thead><tbody>${queue.map(q => `<tr>
        <td>${q.patients ? q.patients.prenom + ' ' + q.patients.nom : '—'}</td>
        <td>${q.compagnie}</td><td>${q.numero_police || '—'}</td><td>${q.statut}</td>
        <td>${new Date(q.created_at).toLocaleDateString('fr-MA')}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger);font-size:13px">⚠ ${err.message}</p>`;
  }
}

function logout() {
  setAuthToken(null);
  currentUser = null;
  location.reload();
}

async function loadSuperAdminPanel() {
  try {
    const perms = await apiAuthFetch('/admin/permissions');
    renderPermissionsMatrix(perms);
    const users = await apiAuthFetch('/admin/users');
    renderUsersTable(users);
  } catch (err) {
    showToast('⚠ ' + err.message, true);
  }
}

const MODULE_LABELS = {
  can_view_ordonnances: 'Ordonnances',
  can_view_patients: 'Patients',
  can_view_pharmacies: 'Pharmacies',
  can_view_laboratoires: 'Laboratoires',
  can_view_assurances: 'Assurances',
  can_view_transactions: 'Transactions',
  can_manage_users: 'Gestion utilisateurs',
};

function renderPermissionsMatrix(perms) {
  const modules = Object.keys(MODULE_LABELS);
  const rows = perms.map(p => `
    <tr>
      <td style="font-weight:600">${p.role}</td>
      ${modules.map(m => `
        <td style="text-align:center">
          <input type="checkbox" ${p[m] ? 'checked' : ''} ${p.role === 'super_admin' ? 'disabled' : ''}
            onchange="updatePermission('${p.role}','${m}',this.checked)">
        </td>`).join('')}
    </tr>`).join('');

  document.getElementById('rights-matrix').innerHTML = `
    <table class="stock-table">
      <thead><tr><th>Rôle</th>${modules.map(m => `<th>${MODULE_LABELS[m]}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function updatePermission(role, key, value) {
  try {
    await apiAuthFetch('/admin/permissions/' + role, { method: 'PUT', body: JSON.stringify({ [key]: value }) });
    showToast('✅ Droits mis à jour pour ' + role);
  } catch (err) {
    showToast('⚠ ' + err.message, true);
  }
}

function renderUsersTable(users) {
  const rows = users.map(u => `
    <tr>
      <td>${u.username}</td>
      <td>${u.email || '—'}</td>
      <td>${u.role}</td>
      <td>${u.is_active ? '✅' : '❌'}</td>
      <td><button class="btn-sm" onclick="toggleUserActive('${u.id}', ${!u.is_active})">${u.is_active ? 'Désactiver' : 'Activer'}</button></td>
    </tr>`).join('');
  document.getElementById('users-table').innerHTML = `
    <table class="stock-table">
      <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Actif</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function toggleUserActive(id, is_active) {
  try {
    await apiAuthFetch('/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ is_active }) });
    loadSuperAdminPanel();
  } catch (err) {
    showToast('⚠ ' + err.message, true);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.querySelectorAll('#register-form input[name="role"]').forEach(r => r.addEventListener('change', updateEmailRequirement));
  updateEmailRequirement();

  const token = authToken();
  if (!token) { showAuthOverlay(); return; }
  try {
    const { user } = await apiAuthFetch('/auth/me');
    currentUser = user;
    onAuthSuccess();
  } catch {
    setAuthToken(null);
    showAuthOverlay();
  }
});
