const form = document.getElementById('evidence-form');
const statusLine = document.getElementById('evidence-status');
const results = document.getElementById('evidence-results');

async function showWorkspace() {
  const access = document.getElementById('evidence-access');
  const message = document.getElementById('evidence-access-status');
  const token = localStorage.getItem('sc_token');
  const signInMessage = 'Connectez-vous à SantéConnect avec un compte médecin.';
  if (!token) {
    message.textContent = signInMessage;
    return;
  }
  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    });
    if ([401, 403, 404].includes(response.status)) {
      message.textContent = signInMessage;
      return;
    }
    if (!response.ok) throw new Error('Session unavailable');
    const { user } = await response.json();
    if (user?.role !== 'medecin') {
      message.textContent = 'Le compte connecté ne donne pas accès à l’espace médecin.';
      return;
    }
    access.hidden = true;
    document.getElementById('evidence-tools').hidden = false;
    document.getElementById('evidence-documents').hidden = false;
  } catch {
    message.textContent = 'Impossible de vérifier votre session pour le moment. Réessayez dans un instant.';
  }
}
void showWorkspace();

function sourceLink(source, label) {
  const link = document.createElement('a');
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function appendText(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
}

function render(data) {
  if (!data.sources.length) {
    statusLine.textContent = data.partial ? 'Recherche incomplète. Aucune référence disponible.' : 'Aucune référence admissible trouvée.';
    return;
  }
  const notes = [];
  if (data.partial) notes.push('Certaines recherches n’ont pas abouti.');
  if (data.synthesis === 'disabled') notes.push('La synthèse IA pilote est désactivée pour cette session.');
  if (data.synthesis === 'unavailable') notes.push('Synthèse indisponible. Consultez les références originales.');
  statusLine.textContent = notes.join(' ');
  if (data.claims.length) {
    appendText(results, 'h2', 'Synthèse avec contrôle automatisé');
    const list = appendText(results, 'ul', '');
    for (const claim of data.claims) {
      const source = data.sources.find(item => item.id === claim.id);
      const item = appendText(list, 'li', claim.text + ' ');
      item.append(sourceLink(source, 'PMID ' + source.id));
      appendText(item, 'blockquote', claim.quote).dir = 'auto';
    }
  }
  appendText(results, 'h2', 'Références Europe PMC');
  const list = appendText(results, 'ol', '');
  for (const source of data.sources) {
    const item = appendText(list, 'li', '');
    item.append(sourceLink(source, source.title));
    appendText(item, 'div', [source.authors, source.year, 'PMID ' + source.id, source.license, ...source.types].filter(Boolean).join(' · '));
  }
  appendText(results, 'p', 'Recherche par thème sur une sélection de publications CC BY et leurs résumés. La couverture et le niveau de preuve varient selon les résultats.');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  results.replaceChildren();
  statusLine.textContent = 'Recherche en cours…';
  try {
    const search = new URLSearchParams({
      topic: document.getElementById('evidence-topic').value,
      mode: document.getElementById('evidence-mode').value,
    });
    const token = localStorage.getItem('sc_token');
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const response = await fetch('/api/evidence?' + search, { cache: 'no-store', headers });
    if (response.status === 401 || response.status === 403) {
      statusLine.textContent = 'Connectez-vous à SantéConnect avec un compte médecin pour lancer la recherche.';
      return;
    }
    if (response.status === 429) {
      statusLine.textContent = 'Limite de recherche atteinte. Réessayez plus tard.';
      return;
    }
    if (!response.ok) throw new Error('Search unavailable');
    render(await response.json());
  } catch {
    statusLine.textContent = 'La recherche est indisponible. Réessayez dans un instant.';
  } finally {
    button.disabled = false;
  }
});
