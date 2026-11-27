document.addEventListener('DOMContentLoaded', () => {
  const authError = document.getElementById('auth-error');
  const authStatus = document.getElementById('auth-status');
  const resetForm = document.getElementById('reset-password-form');
  const codeForm = document.getElementById('recovery-code-form');
  const changeForm = document.getElementById('change-password-form');
  const codeResult = document.getElementById('recovery-code-result');
  const codeValue = document.getElementById('recovery-code-value');
  const codeStatus = document.getElementById('recovery-code-status');

  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    const field = document.getElementById(button.getAttribute('aria-controls'));
    button.addEventListener('click', () => {
      const visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      const label = visible ? 'password_hide' : 'password_show';
      button.dataset.t = label;
      button.textContent = t(label);
    });
    field.form.addEventListener('reset', () => {
      field.type = 'password';
      button.setAttribute('aria-pressed', 'false');
      button.dataset.t = 'password_show';
      button.textContent = t('password_show');
    });
  }

  document.getElementById('forgot-password').addEventListener('click', () => {
    switchAuthTab('reset');
    resetForm.elements.username.value = document.getElementById('login-form').elements.username.value;
    resetForm.elements.username.focus();
  });

  document.getElementById('back-to-login').addEventListener('click', () => {
    resetForm.reset();
    switchAuthTab('login');
    document.getElementById('login-form').elements.username.focus();
  });

  function clearCode() {
    codeValue.textContent = '';
    codeResult.hidden = true;
  }

  const settings = document.getElementById('account-security');
  settings.addEventListener('toggle', () => { if (!settings.open) clearCode(); });
  window.addEventListener('pagehide', clearCode);

  function bind(form, message, path, run) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const params = Object.fromEntries(new FormData(form));
      message.textContent = '';
      if ('confirmPassword' in params && params.newPassword !== params.confirmPassword) {
        message.textContent = t('password_mismatch');
        return;
      }
      delete params.confirmPassword;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const response = await apiAuthFetch(path, { method: 'POST', body: JSON.stringify(params) });
        form.reset();
        run(response, params);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  bind(resetForm, authError, '/auth/reset-password', (_, { username }) => {
    setAuthToken(null);
    switchAuthTab('login');
    const login = document.getElementById('login-form');
    login.reset();
    login.elements.username.value = username.trim();
    login.elements.password.focus();
    authStatus.textContent = t('password_updated');
  });

  bind(codeForm, codeStatus, '/auth/recovery-code', ({ code }) => {
    if (!settings.open) return;
    codeValue.textContent = code;
    codeResult.hidden = false;
    codeStatus.textContent = t('recovery_code_ready');
  });

  document.getElementById('copy-recovery-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeValue.textContent);
      codeStatus.textContent = t('recovery_code_copied');
    } catch {
      codeStatus.textContent = t('recovery_code_copy_manually');
    }
  });

  bind(changeForm, document.getElementById('change-password-status'), '/auth/change-password', () => {
    sessionStorage.setItem('sc_password_updated', '1');
    logout();
  });

  if (sessionStorage.getItem('sc_password_updated') === '1') {
    sessionStorage.removeItem('sc_password_updated');
    authStatus.textContent = t('password_updated');
  }
});
