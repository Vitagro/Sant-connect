const voicePanel = document.getElementById('evidence-voice');
const voiceStatus = document.getElementById('voice-status');
const voiceLanguage = document.getElementById('voice-language');
const voiceListen = document.getElementById('voice-listen');
const voiceInstall = document.getElementById('voice-install');
const voiceRead = document.getElementById('voice-read');
const topicSelect = document.getElementById('evidence-topic');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const commands = {
  diabetes: /diab[eè]te|السكري|السكر|الديابيط/i,
  hypertension: /hypertension|tension|ضغط الدم|الضغط|الطونسيون/i,
  asthma: /asthme|الربو|ربو|الربوة/i,
  vaccination: /vaccin|تطعيم|التلقيح|لقاح/i,
  sleep: /sommeil|insomnie|النوم|الأرق|النعاس/i,
};
const spokenTopics = {
  diabetes: 'السكري من النوع الثاني', hypertension: 'ارتفاع ضغط الدم', asthma: 'الربو',
  vaccination: 'التلقيح', sleep: 'النوم',
};

let activeRecognition;
let checkVersion = 0;

function speechOptions() {
  return { langs: [voiceLanguage.value], processLocally: true };
}

async function checkVoice() {
  const version = ++checkVersion;
  voiceListen.disabled = true;
  voiceInstall.disabled = true;
  if (!Recognition?.available || !('processLocally' in Recognition.prototype)) {
    voiceStatus.textContent = 'La reconnaissance vocale locale est indisponible dans ce navigateur.';
    return;
  }
  try {
    const status = await Recognition.available(speechOptions());
    if (version !== checkVersion) return;
    voiceListen.disabled = status !== 'available';
    voiceInstall.disabled = status !== 'downloadable' || !Recognition.install;
    const messages = {
      available: 'Microphone prêt. Dites un des thèmes affichés.',
      downloadable: 'Téléchargez le module vocal proposé par le navigateur.',
      downloading: 'Le module vocal est en cours de téléchargement.',
    };
    voiceStatus.textContent = messages[status] || 'Cette langue de reconnaissance locale est indisponible sur cet appareil.';
  } catch {
    if (version === checkVersion) voiceStatus.textContent = 'Le navigateur bloque la reconnaissance vocale locale.';
  }
}

voicePanel.addEventListener('toggle', () => {
  if (voicePanel.open) void checkVoice();
  else activeRecognition?.abort();
});
voiceLanguage.addEventListener('change', () => {
  activeRecognition?.abort();
  void checkVoice();
});
voiceInstall.addEventListener('click', async () => {
  voiceInstall.disabled = true;
  try {
    await Recognition.install(speechOptions());
  } catch {
    voiceStatus.textContent = 'Le téléchargement du module vocal a échoué.';
    voiceInstall.disabled = false;
    return;
  }
  await checkVoice();
});
voiceListen.addEventListener('click', () => {
  if (activeRecognition) return;
  const speech = new Recognition();
  activeRecognition = speech;
  speech.lang = voiceLanguage.value;
  speech.processLocally = true;
  speech.maxAlternatives = 1;
  voiceListen.disabled = true;
  voiceStatus.textContent = 'Écoute en cours…';
  speech.onresult = event => {
    const transcript = event.results[0]?.[0]?.transcript || '';
    const matches = Object.keys(commands).filter(topic => commands[topic].test(transcript));
    if (matches.length !== 1) {
      voiceStatus.textContent = 'Je n’ai pas reconnu un thème unique. Choisissez-le dans la liste ou réessayez.';
      return;
    }
    topicSelect.value = matches[0];
    voiceStatus.textContent = 'Thème sélectionné. Vérifiez-le puis lancez la recherche.';
  };
  speech.onerror = () => { voiceStatus.textContent = 'Écoute locale indisponible. Vous pouvez choisir le thème dans la liste.'; };
  speech.onend = () => {
    activeRecognition = undefined;
    if (speech.lang === voiceLanguage.value) voiceListen.disabled = false;
  };
  try {
    speech.start();
  } catch {
    activeRecognition = undefined;
    voiceListen.disabled = false;
    voiceStatus.textContent = 'Impossible d’activer le microphone local.';
  }
});

voiceRead.addEventListener('click', () => {
  const synthesis = window.speechSynthesis;
  const lang = voiceLanguage.value;
  const voices = synthesis?.getVoices().filter(voice => voice.localService) || [];
  const voice = voices.find(item => item.lang.toLowerCase() === lang.toLowerCase()) ||
    (lang === 'ar-MA' ? undefined : voices.find(item => item.lang.split('-')[0] === lang.split('-')[0]));
  if (!voice) {
    voiceStatus.textContent = 'Aucune voix locale compatible avec cette langue sur cet appareil.';
    return;
  }
  const count = document.querySelectorAll('#evidence-results ol li').length;
  const text = lang === 'fr-FR'
    ? [topicSelect.selectedOptions[0].textContent, count + ' références affichées.'].join('. ')
    : lang === 'ar-MA'
      ? [spokenTopics[topicSelect.value], 'كاين ' + count + ' ديال المراجع فهاد الصفحة.'].filter(Boolean).join('. ')
      : [spokenTopics[topicSelect.value], 'عدد المراجع المعروضة ' + count + '.'].filter(Boolean).join('. ');
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  synthesis.cancel();
  synthesis.speak(utterance);
});
window.addEventListener('pagehide', () => {
  activeRecognition?.abort();
  window.speechSynthesis?.cancel();
});
