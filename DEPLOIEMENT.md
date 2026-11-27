# 🚀 SantéConnect v3 — Déploiement sur vita-core.org
## Powered by Vita Tech

---

## Architecture finale

```
vita-core.org (domaine)
      │
      ├── Vercel (Frontend + API Node.js)
      │         ↕
      ├── Supabase (PostgreSQL + RLS)
      │         ↕
      └── Twilio (WhatsApp) + CMI (Paiement)
```

---

## ÉTAPE 1 — Supabase (5 min)

1. Aller sur **supabase.com** → New Project
   - Nom : `sante-connect-vita`
   - Région : **Europe West** (le plus proche du Maroc)
   - Mot de passe DB : générez un mot de passe fort

2. **SQL Editor** → New Query → coller `supabase/schema.sql` → **Run**

3. **Settings → API** → copier :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_KEY`

4. Mettre à jour `public/index.html` lignes meta :
```html
<meta name="supa-url" content="https://VOTRE_ID.supabase.co">
<meta name="supa-key" content="VOTRE_ANON_KEY">
```

---

## ÉTAPE 2 — Variables Vercel

```powershell
# Installer Vercel CLI (si pas déjà fait)
npm install -g vercel

# Se connecter
vercel login

# Dans le dossier sante-v3
cd sante-v3
npm install

# Ajouter les variables (une par une — Vercel demande la valeur)
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_KEY
vercel env add JWT_SECRET
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
vercel env add TWILIO_WHATSAPP_NUMBER
vercel env add CMI_CLIENT_ID
vercel env add CMI_SECRET
vercel env add CMI_GATEWAY_URL
vercel env add VIREMENT_SECRET
vercel env add BANK_IBAN
vercel env add BANK_SWIFT
```

Pour chaque variable : sélectionner **Production + Preview + Development**

---

## ÉTAPE 3 — Premier déploiement

```powershell
# Depuis le dossier sante-v3
vercel --prod
```

Votre app sera sur : `https://sante-connect-vita.vercel.app`

---

## ÉTAPE 4 — Connecter vita-core.org

### Option A — Domaine principal (vita-core.org)
1. Vercel Dashboard → votre projet → **Settings → Domains**
2. Cliquer **Add Domain** → entrer `vita-core.org`
3. Vercel vous donne les enregistrements DNS à ajouter

### Option B — Sous-domaine (sante.vita-core.org)
1. Même procédure avec `sante.vita-core.org`
2. Chez votre registrar (GoDaddy, OVH, etc.) ajouter :
   ```
   Type : CNAME
   Nom  : sante
   Valeur: cname.vercel-dns.com
   ```

### Option C — Redirection depuis vita-core.org
Si vita-core.org est déjà un site, ajouter une redirection ou un lien vers le sous-domaine Vercel.

---

## ÉTAPE 5 — Twilio WhatsApp Sandbox

1. Aller sur **console.twilio.com**
2. **Messaging → Try it out → Send a WhatsApp message**
3. Chaque destinataire doit envoyer `join <mot-clé>` au `+14155238886`
4. Pour la production : demander un numéro WhatsApp Business dédié

---

## ÉTAPE 6 — CMI Paiement (Test)

1. Contacter CMI Maroc : **cmi.co.ma** pour obtenir les clés sandbox
2. Utiliser `CMI_GATEWAY_URL=https://testpayment.cmi.co.ma/fim/est3Dgate` pour les tests
3. Passer en production : changer vers `https://payment.cmi.co.ma/fim/est3Dgate`

---

## Structure du projet

```
sante-v3/
├── public/                 ← Frontend (HTML/CSS/JS)
│   ├── index.html          ← Application principale
│   ├── css/style.css       ← Design Vita Tech
│   └── js/
│       ├── translations.js ← FR / AR / EN
│       ├── app.js          ← Logique formulaires
│       └── api-client.js   ← Connexion API + Supabase
├── api/
│   └── server.js           ← API Node.js (Vercel serverless)
├── lib/
│   ├── supabase.js         ← Client Supabase
│   └── whatsapp.js         ← Templates WhatsApp Twilio
├── supabase/
│   ├── schema.sql          ← Tables + RLS + données démo
│   └── rls_security.sql    ← Politiques sécurité avancées
├── .env.example            ← Variables d'environnement modèle
├── vercel.json             ← Config déploiement Vercel
└── DEPLOIEMENT.md          ← Ce guide
```

---

## Endpoints API disponibles

```
GET  /api/status                       → Vérification serveur
GET  /api/pharmacies                   → Liste pharmacies (Supabase)
GET  /api/laboratoires                 → Liste laboratoires (Supabase)
POST /api/ordonnances                  → Créer ordonnance + WA
GET  /api/ordonnances                  → Lister ordonnances
POST /api/confirmations/pharmacie      → Confirmer stock
POST /api/confirmations/labo           → Confirmer RDV
POST /api/assurances/verifier          → Vérifier assurance (A/B)
POST /api/paiements/initier            → Initier paiement CMI/virement
POST /api/paiements/callback/cmi       → Callback CMI 3DS
POST /api/notify/test                  → Test WhatsApp
```

---

## Commandes de déploiement rapide

```powershell
# Déployer une mise à jour
vercel --prod

# Voir les logs en temps réel
vercel logs --follow

# Vérifier les variables d'env
vercel env ls

# Ouvrir le projet dans le navigateur
vercel open
```

---

## Contact & Support

🌐 **vita-core.org**
📧 contact@vita-core.org
🇲🇦 SantéConnect v3 — Powered by **Vita Tech**

---

*Document confidentiel — Vita Tech © 2025 — Tous droits réservés*

## Vérifier le service des comptes

Sur le projet cible, renseigner le service Supabase de SantéConnect et `JWT_SECRET` dans les variables serveur. Conserver le secret JWT existant si des sessions doivent rester valides. Confirmer que le schéma v3 est chargé, notamment `public.users` et les tables des profils professionnels, et que le rôle serveur dispose des autorisations Data API requises. Le contrôle `/api/status` vérifie la lecture de la table des ordonnances. Vérifier aussi une inscription de test dans un environnement de prévisualisation.

Sans service de comptes opérationnel, l’inscription et la connexion renvoient une indisponibilité temporaire. **Continuer sans compte** ouvre la présentation publique des services sans créer de session. Le visiteur ne peut pas consulter les ordonnances ni envoyer de demandes, de notifications ou d’initiations de paiement depuis cet espace.

## Sécurité du compte

Après le schéma initial, appliquer la migration `supabase/migrations/20261127115857_account_recovery.sql` avant le déploiement de la récupération. Elle ajoute une version de session et le condensat du code de récupération. Les comptes existants conservent leur mot de passe et peuvent générer leur premier code depuis leur espace.

Dans **Sécurité du compte**, le mot de passe actuel est requis pour générer un code ou le changer. Le code est affiché une fois. Il remplace le code précédent, expire après un an et permet une seule réinitialisation. Une réinitialisation ou un changement de mot de passe invalide les sessions et le code précédents. Conserver un code dans un endroit sûr avant de perdre le mot de passe. Cette version ne dépend d’aucun service d’envoi de courriels.
