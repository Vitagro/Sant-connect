const workspaces = {
  medecin: {
    label: 'Médecin',
    questions: {
      diabetes: ['Quelles données récentes sur la prise en charge du diabète de type 2 ?', '"type 2 diabetes"'],
      hypertension: ['Quelles données sur la prise en charge de l’hypertension artérielle ?', '"arterial hypertension" OR "high blood pressure"'],
      asthma: ['Quelles données sur la prise en charge de l’asthme ?', 'asthma'],
      vaccination: ['Que disent les études sur la vaccination ?', 'vaccination'],
      sleep: ['Quelles données sur l’insomnie et l’hygiène du sommeil ?', '"sleep hygiene" OR insomnia'],
    },
  },
  patient: {
    label: 'Patient',
    questions: {
      'patient-sleep': ['Quelles habitudes favorisent le sommeil ?', '"sleep hygiene" OR "sleep habits"'],
      'patient-activity': ['Que montrent les études sur l’activité physique et le bien-être ?', '"physical activity" AND (wellbeing OR "well-being" OR "quality of life")'],
      'patient-vaccination': ['Comment évalue-t-on la protection apportée par les vaccins ?', 'vaccination AND (effectiveness OR efficacy)'],
      'patient-diabetes': ['Que montrent les études sur l’éducation au diabète de type 2 ?', '"type 2 diabetes" AND ("patient education" OR "self-management education")'],
      'patient-information': ['Comment mieux comprendre les informations de santé ?', '"health literacy" AND ("patient education" OR "patient information")'],
    },
  },
  pharmacie: {
    label: 'Pharmacie',
    questions: {
      'pharmacy-adherence': ['Quelles interventions en pharmacie aident à suivre un traitement ?', '("community pharmacy" OR "community pharmacist") AND ("medication adherence" OR "treatment adherence")'],
      'pharmacy-reconciliation': ['Que montrent les études sur la conciliation médicamenteuse ?', '"medication reconciliation"'],
      'pharmacy-safety': ['Quelles pratiques réduisent les erreurs de dispensation ?', '(pharmacy OR pharmacist) AND ("dispensing errors" OR "medication errors")'],
      'pharmacy-counselling': ['Comment évalue-t-on le conseil du pharmacien ?', '("pharmacist counselling" OR "pharmacist counseling" OR "pharmacist-led counselling")'],
    },
  },
  labo: {
    label: 'Laboratoire',
    questions: {
      'lab-preanalytics': ['Quelles erreurs surviennent avant l’analyse d’un prélèvement ?', '("preanalytical errors" OR "pre-analytical errors") AND (laboratory OR specimen)'],
      'lab-quality': ['Comment évalue-t-on la qualité en biologie médicale ?', '"external quality assessment" AND (laboratory OR laboratories)'],
      'lab-transport': ['Comment le transport des prélèvements influe-t-il sur les résultats ?', '("specimen transport" OR "sample transport") AND (laboratory OR diagnostic)'],
      'lab-results': ['Comment améliorer la communication des résultats critiques ?', '("critical values" OR "critical results") AND laboratory AND (communication OR reporting)'],
    },
  },
  assurance: {
    label: 'Assurance',
    questions: {
      'insurance-access': ['Quels effets la couverture santé a-t-elle sur l’accès aux soins ?', '"health insurance" AND ("access to care" OR "healthcare access")'],
      'insurance-cost': ['Quels effets le reste à charge a-t-il sur le recours aux soins ?', '("out-of-pocket" OR copayment) AND ("health care utilization" OR "access to care")'],
      'insurance-prevention': ['Que montrent les études sur la couverture des soins préventifs ?', '("health insurance" OR "insurance coverage") AND ("preventive care" OR "preventive services")'],
      'insurance-equity': ['Quels facteurs contribuent aux inégalités de couverture santé ?', '"health insurance coverage" AND (inequality OR disparities OR equity)'],
    },
  },
  super_admin: {
    label: 'Administration',
    questions: {
      'admin-data-quality': ['Comment évaluer la qualité des données de santé ?', '("electronic health records" OR "health information systems") AND "data quality"'],
      'admin-privacy': ['Comment protéger la confidentialité des dossiers de santé numériques ?', '("electronic health records" OR "digital health") AND ("data privacy" OR confidentiality)'],
      'admin-interoperability': ['Quels obstacles freinent l’interopérabilité des systèmes de santé ?', 'interoperability AND ("health information systems" OR "electronic health records")'],
      'admin-safety': ['Comment les organisations mesurent-elles la sécurité des patients ?', '"patient safety" AND ("quality indicators" OR "safety culture")'],
    },
  },
};

function getWorkspace(role) {
  return Object.hasOwn(workspaces, role) ? workspaces[role] : undefined;
}

function evidenceTopics(req, res) {
  const workspace = getWorkspace(req.user.role);
  return res.json({
    role: req.user.role,
    label: workspace.label,
    questions: Object.entries(workspace.questions).map(([id, [label]]) => ({ id, label })),
  });
}

module.exports = { getWorkspace, evidenceTopics };
