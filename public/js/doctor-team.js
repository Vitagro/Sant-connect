document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('doctor-team');
  const teamForm = document.getElementById('team-invite-form');
  const inviteForm = document.getElementById('team-accept-form');
  const status = document.getElementById('team-status');
  const inviteResult = document.getElementById('team-invite-result');
  const inviteSecret = document.getElementById('team-invite-secret');
  const members = document.getElementById('team-members');
  const authError = document.getElementById('auth-error');

  function hideCode() {
    inviteResult.hidden = true;
    inviteSecret.textContent = '';
  }

  function showCode(response) {
    if (!response.code || !panel.open) return;
    inviteSecret.textContent = response.member.username + ' · ' + response.code;
    inviteResult.hidden = false;
  }

  function render(rows) {
    members.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Aucun membre pour le moment.';
      members.append(empty);
      return;
    }
    for (const member of rows) {
      const item = document.createElement('li');
      const name = [member.prenom, member.nom].filter(Boolean).join(' ') || member.username;
      const label = document.createElement('strong');
      const details = document.createElement('span');
      const actions = document.createElement('div');
      const waiting = !member.team_activated_at;
      const expires = Date.parse(member.team_invite_expires_at);
      const awaiting = expires > Date.now();
      const state = waiting ? (awaiting ? 'Invitation en attente' : expires ? 'Invitation expirée' : 'Invitation annulée')
        : member.is_active ? 'Actif' : 'Accès suspendu';
      label.textContent = name;
      details.textContent = [member.username, t('role_' + member.role), state].join(' · ');
      const choices = waiting ? [['renew', 'Nouveau code'], ...(awaiting ? [['revoke', 'Annuler l’invitation']] : [])]
        : member.is_active ? [['disable', 'Suspendre']] : [['enable', 'Réactiver']];
      for (const [action, title] of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline';
        button.textContent = title;
        button.addEventListener('click', async () => {
          button.disabled = true;
          status.textContent = '';
          hideCode();
          try {
            const result = await apiAuthFetch('/team/' + encodeURIComponent(member.id), {
              method: 'PATCH', body: JSON.stringify({ action }),
            });
            showCode(result);
            status.textContent = 'Équipe mise à jour.';
            await refresh();
          } catch (error) {
            status.textContent = error.message;
          } finally {
            button.disabled = false;
          }
        });
        actions.append(button);
      }
      item.append(label, details, actions);
      members.append(item);
    }
  }

  async function refresh() {
    try {
      render(await apiAuthFetch('/team'));
    } catch (error) {
      status.textContent = error.message;
    }
  }

  panel.addEventListener('toggle', () => {
    if (panel.open && currentUser?.role === 'medecin') void refresh();
    else hideCode();
  });
  window.addEventListener('pagehide', hideCode);

  teamForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = teamForm.querySelector('[type=submit]');
    const fields = Object.fromEntries(new FormData(teamForm));
    status.textContent = '';
    hideCode();
    button.disabled = true;
    try {
      showCode(await apiAuthFetch('/team', { method: 'POST', body: JSON.stringify(fields) }));
      teamForm.reset();
      status.textContent = 'Invitation créée.';
      await refresh();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('team-invite-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteSecret.textContent);
      status.textContent = 'Identifiant et code copiés.';
    } catch {
      status.textContent = 'Sélectionnez le texte pour le copier.';
    }
  });
  document.getElementById('team-accept-link').addEventListener('click', () => {
    switchAuthTab('team');
    inviteForm.elements.username.focus();
  });
  document.getElementById('team-back-login').addEventListener('click', () => switchAuthTab('login'));
  inviteForm.addEventListener('submit', async event => {
    event.preventDefault();
    authError.textContent = '';
    const { username, code, password, confirmPassword } = Object.fromEntries(new FormData(inviteForm));
    if (password !== confirmPassword) {
      authError.textContent = t('password_mismatch');
      return;
    }
    const button = inviteForm.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await apiAuthFetch('/auth/team-accept', { method: 'POST', body: JSON.stringify({ username, code, password }) });
      switchAuthTab('login');
      const login = document.getElementById('login-form');
      login.elements.username.value = username.trim().toLowerCase();
      login.elements.password.focus();
      document.getElementById('auth-status').textContent = 'Compte activé. Vous pouvez vous connecter.';
    } catch (error) {
      authError.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});
