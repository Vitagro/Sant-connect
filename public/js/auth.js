// public/js/auth.js — SantéConnect v3 | Vita Tech
// Registration/login gate + Super Admin rights panel.

const EMAIL_REQUIRED_ROLES = new Set(['medecin', 'labo', 'assurance']);
let currentUser = null;

function authToken() { return localStorage.getItem('sc_token'); }
function setAuthToken(t) { t ? localStorage.setItem('sc_token', t) : localStorage.removeItem('sc_token'); }

async function apiAuthFetch(path, options = {}) {
  let r;
  try {
    r = await sessionFetch(window.API_BASE + path, options);
  } catch {
    throw new Error(t('guest_auth_unavailable'));
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(r.status >= 500 ? t('guest_auth_unavailable') : data.error || t('auth_err_server'));
    error.status = r.status;
    throw error;
  }
  if (!data.user && (path === '/auth/register' || path === '/auth/login' || path === '/auth/me')) {
    throw new Error(t('guest_auth_unavailable'));
  }
  return data;
}

function switchAuthTab(tab) {
  document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  const recoveryForm = document.getElementById('reset-password-form');
  recoveryForm.classList.toggle('hidden', tab !== 'reset');
  if (tab !== 'reset') recoveryForm.reset();
  document.getElementById('auth-status').textContent = '';
  document.getElementById('auth-error').textContent = '';
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('guest-root').classList.add('hidden');
}
function hideAuthOverlay() {
  document.getElementById('auth-overlay').classList.add('hidden');
}

function updateEmailRequirement() {
  const role = document.querySelector('#register-form input[name="role"]:checked')?.value;
  const emailInput = document.getElementById('reg-email');
  const emailLabel = document.getElementById('reg-email-label');
  const required = EMAIL_REQUIRED_ROLES.has(role);
  emailInput.required = required;
  const form = document.getElementById('register-form');
  for (const name of ['nom', 'prenom']) form.elements.namedItem(name).required = role === 'medecin';
  emailLabel.setAttribute('data-t', required ? 'auth_email_required' : 'auth_email_optional');
  emailLabel.textContent = t(required ? 'auth_email_required' : 'auth_email_optional');
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
  document.getElementById('guest-root').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('nav-logout').classList.remove('hidden');
  document.getElementById('nav-username').textContent = currentUser.username;
  document.getElementById('nav-username').classList.remove('hidden');

  void loadPharmaciesLabos();
  const roleCards = document.querySelectorAll('.role-grid .role-card');
  const role = currentUser.role === 'super_admin' ? 'superadmin' : currentUser.role;
  const assignedCard = Array.from(roleCards).find(card => card.dataset.role === role);
  if (assignedCard && currentUser.role !== 'super_admin') {
    const heading = document.querySelector('.role-header h1');
    const subtitle = document.querySelector('.role-header p');
    heading.dataset.t = 'role_' + role;
    subtitle.dataset.t = 'role_' + role + '_sub';
    heading.textContent = t(heading.dataset.t);
    subtitle.textContent = t(subtitle.dataset.t);
  }
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
    if (!queue.length) { el.innerHTML = `<p style="color:var(--text-2);font-size:13px">${t('assurance_no_queue')}</p>`; return; }
    el.innerHTML = `<table class="stock-table"><thead><tr>
      <th>${t('assurance_col_patient')}</th><th>${t('assurance_col_compagnie')}</th><th>${t('assurance_col_police')}</th><th>${t('assurance_col_statut')}</th><th>${t('assurance_col_date')}</th>
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

const MODULE_TRANSLATION_KEYS = {
  can_view_ordonnances: 'admin_module_ordonnances',
  can_view_patients: 'admin_module_patients',
  can_view_pharmacies: 'admin_module_pharmacies',
  can_view_laboratoires: 'admin_module_laboratoires',
  can_view_assurances: 'admin_module_assurances',
  can_view_transactions: 'admin_module_transactions',
  can_manage_users: 'admin_module_users',
};

function renderPermissionsMatrix(perms) {
  const modules = Object.keys(MODULE_TRANSLATION_KEYS);
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
      <thead><tr><th>${t('admin_col_role')}</th>${modules.map(m => `<th>${t(MODULE_TRANSLATION_KEYS[m])}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function updatePermission(role, key, value) {
  try {
    await apiAuthFetch('/admin/permissions/' + role, { method: 'PUT', body: JSON.stringify({ [key]: value }) });
    showToast('✅ ' + t('admin_rights_updated') + ' ' + role);
  } catch (err) {
    showToast('⚠ ' + err.message, true);
  }
}

function renderUsersTable(users) {
  const table = document.createElement('table');
  table.className = 'stock-table';
  const headings = table.createTHead().insertRow();
  for (const key of ['admin_col_user', 'admin_col_email', 'admin_col_role', 'admin_col_active', null]) {
    const label = document.createElement('th');
    label.scope = 'col';
    label.textContent = key ? t(key) : '';
    headings.append(label);
  }
  const body = table.createTBody();
  for (const user of users) {
    const row = body.insertRow();
    for (const value of [user.username, user.email || '—', user.role, user.is_active ? '✅' : '❌']) {
      row.insertCell().textContent = value;
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn-sm';
    toggle.textContent = user.is_active ? t('admin_deactivate') : t('admin_activate');
    toggle.addEventListener('click', () => toggleUserActive(user.id, !user.is_active));
    row.insertCell().append(toggle);
  }
  document.getElementById('users-table').replaceChildren(table);
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
  document.getElementById('nav-logout').addEventListener('click', logout);
  document.getElementById('tab-login-btn').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register-btn').addEventListener('click', () => switchAuthTab('register'));
  const guest = document.getElementById('guest-root');
  document.getElementById('guest-continue').addEventListener('click', () => {
    hideAuthOverlay();
    guest.classList.remove('hidden');
    guest.querySelector('h1').focus();
  });
  for (const [button, tab] of [['guest-sign-in', 'login'], ['guest-sign-up', 'register']]) {
    document.getElementById(button).addEventListener('click', () => {
      showAuthOverlay();
      switchAuthTab(tab);
      document.getElementById(tab + '-form').elements.namedItem('username').focus();
    });
  }
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
  } catch (error) {
    if ([401, 403, 404].includes(error.status)) setAuthToken(null);
    showAuthOverlay();
  }
});
