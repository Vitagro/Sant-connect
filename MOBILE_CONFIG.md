# Configuration mobile — SantéConnect

L'app mobile (Capacitor) charge le site en direct (`sante-connect-xi.vercel.app`).
Toutes les clés sensibles vivent côté serveur (Vercel), jamais dans le code mobile.

## ✅ Déjà configuré (rien à faire)

| Où | Quoi |
|---|---|
| Vercel → Project → Settings → Environment Variables (Production + Development) | `JWT_SECRET` (généré automatiquement) |
| GitHub → Settings → Secrets and variables → Actions | `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` (signature Android) |

## ⚠️ À faire toi-même

1. **Vérifie que ces variables existent déjà sur Vercel** (elles doivent avoir
   été configurées lors du déploiement initial) — Project → Settings →
   Environment Variables :
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` (notifications WhatsApp)
   - Voir `.env.example` à la racine pour la liste complète avec description.

2. **Exécuter le schéma SQL mis à jour** — Dashboard Supabase → SQL Editor →
   coller le contenu de `supabase/schema.sql` → Run (ajoute les tables
   `users`, `assurances`, `role_permissions` pour l'inscription/connexion
   et le Super Admin).

3. **`JWT_SECRET` pour l'environnement Preview** — a été bloqué par une
   sécurité automatique côté agent ; si tu utilises des previews de
   branches Vercel, ajoute-le toi-même : Project → Settings → Environment
   Variables → Add → `JWT_SECRET` → coche "Preview" → colle une valeur
   aléatoire longue (ex: générée via `openssl rand -base64 48`).

## Développement local

Copie `.env.example` en `.env` et remplis les valeurs (jamais commité —
déjà dans `.gitignore`).
