// lib/whatsapp.js — SantéConnect by Vita Tech
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER;

function fmt(num) {
  const n = (num || '').replace(/\s/g, '');
  if (n.startsWith('0')) return 'whatsapp:+212' + n.slice(1);
  if (n.startsWith('+')) return 'whatsapp:' + n;
  return 'whatsapp:+' + n;
}

async function send(to, body) {
  try {
    const msg = await client.messages.create({ from: FROM, to: fmt(to), body });
    return { ok: true, sid: msg.sid };
  } catch (e) {
    console.error('[WA]', to, e.message);
    return { ok: false, error: e.message };
  }
}

const tpl = {
  patient_ordo: (d) => `🏥 *SantéConnect — Vita Tech*\n\nBonjour *${d.patPrenom} ${d.patNom}*,\n\nVotre ordonnance du *${d.date}* :\n👨‍⚕️ *${d.medTitre} ${d.medNom}*\n🏢 ${d.cabinet} — ${d.ville}\n\n💊 *Médicaments :*\n${d.meds.map((m,i)=>`  ${i+1}. ${m.nom} — ${m.dosage} — ${m.frequence}\n     📌 ${m.condition_util}`).join('\n')}\n\n📋 *Diagnostic :* ${d.diagnostic}\n\n_Votre pharmacie et laboratoire ont été notifiés._\n\n_vita-core.org | Powered by Vita Tech_ 🇲🇦`,

  pharmacie_ordo: (d) => `💊 *SantéConnect — Nouvelle ordonnance*\n\n*Patient :* ${d.patPrenom} ${d.patNom}\n*Assurance :* ${d.assurance||'N/A'}\n⚠️ *Allergies :* ${d.allergies||'Aucune'}\n*Médecin :* ${d.medTitre} ${d.medNom}\n*Spécialité :* ${d.specialty||'Généraliste'}\n*Date :* ${d.date}\n\n💊 *Médicaments :*\n${d.meds.map((m,i)=>`\n  *${i+1}. ${m.nom}*\n  • ${m.dosage} — ${m.frequence} — ${m.duree}\n  • Condition : ${m.condition_util}\n  • Moment : ${m.moment}`).join('\n')}\n\n_Confirmez via vita-core.org_\n_Vita Tech 🇲🇦_`,

  labo_demande: (d) => `🔬 *SantéConnect — Demande d'analyses*\n\n*Patient :* ${d.patPrenom} ${d.patNom}\n*Né(e) le :* ${d.patDob} | *Sexe :* ${d.patSexe}\n*Assurance :* ${d.assurance||'N/A'}\n*Médecin :* ${d.medTitre} ${d.medNom}\n*Spécialité :* ${d.specialty||'Généraliste'}\n\n🧪 *Analyses :*\n${d.analyses.map((a,i)=>`  ${i+1}. ${a.nom} — ⚡ ${a.urgence}`).join('\n')}\n\n📝 *Instructions :* ${d.instructions||'Aucune'}\n\n_Confirmez via vita-core.org_\n_Vita Tech 🇲🇦_`,

  patient_pharma_ok: (d) => `✅ *Pharmacie — Ordonnance prête*\n\nBonjour *${d.patPrenom}*,\n\n💊 *${d.pharmaNom}*\n📍 ${d.pharmaAdresse||''}\n💰 *Prix : ${d.prix} MAD*\n${d.manquants?.length?'\n⚠️ Non disponibles :\n'+d.manquants.map(m=>'  ❌ '+m).join('\n'):''}\n\n_vita-core.org | Vita Tech 🇲🇦_`,

  patient_rdv_ok: (d) => `🔬 *Laboratoire — RDV confirmé*\n\nBonjour *${d.patPrenom}*,\n\n📅 *${d.rdvDate} à ${d.rdvHeure}*\n🏢 *${d.laboNom}*\n${d.jeun?'\n⚠️ *Venez À JEUN*':''}\n${d.instructions?'\n📝 '+d.instructions:''}\n\n_vita-core.org | Vita Tech 🇲🇦_`,

  test: (role) => `🏥 *SantéConnect — Test de connexion*\n\nBonjour !\nVotre numéro est configuré en tant que *${role}*.\n\nVous recevrez ici toutes les notifications médicales importantes.\n\n_vita-core.org | Powered by Vita Tech 🇲🇦_`,
};

module.exports = { send, tpl };
