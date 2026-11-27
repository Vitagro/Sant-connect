# SantéConnect v3 — Recherche médicale, lecture documentaire et voix

Depuis l’espace **Médecin**, ouvrir **Recherche médicale**. La recherche standard interroge les revues systématiques et méta-analyses. Le mode approfondi ajoute des recherches parallèles sur les guides et les essais randomisés. Cinq thèmes prédéfinis sont proposés. Les références indiquent leur provenance, leur type, leur licence et le lien de l’article.

Le serveur récupère les notices MED d’Europe PMC qui disposent d’un identifiant PMC, d’un résumé et d’une licence **CC BY**. Il écarte les notices signalées comme rétractées ou faisant l’objet d’une expression de préoccupation dans les types de publication. La recherche dépend de la couverture et des métadonnées du catalogue. [Documentation de l’API Europe PMC](https://europepmc.org/RestfulWebService) · [Droits de réutilisation](https://europepmc.org/Copyright)

## Garde-fous et confidentialité

- Seuls une session médecin et des identifiants prédéfinis de thème et de mode sont acceptés par l’API de recherche. Europe PMC reçoit des termes statiques publics. Aucun identifiant de compte ni dossier patient ne lui est transmis. Le rôle médecin existant peut être autodéclaré et ne vérifie pas le statut professionnel.
- La synthèse IA est désactivée par défaut et réservée à des comptes pilotes sélectionnés. Un premier appel propose des affirmations. Le serveur exige un identifiant récupéré et un extrait présent mot pour mot dans le résumé. Un second appel vérifie les affirmations et peut toutes les rejeter. La bibliographie reste disponible en cas d’échec. Ces contrôles automatiques ne constituent pas une validation clinique.
- Le lecteur ouvre les TXT UTF-8 (128 Ko maximum), PDF, PNG et JPEG (8 Mo maximum). Il lit les huit premières pages des PDF, applique l’OCR aux images et aux pages sans texte extractible, puis affiche les lignes repérées. Sur une page contenant du texte, il utilise l’extraction de texte. L’OCR est disponible en français, arabe et anglais.
- Les documents restent dans le navigateur. L’écran documentaire bloque les connexions applicatives. Le moteur OCR charge ses composants et dictionnaires uniquement depuis SantéConnect. Les résultats sont effacés à la demande ou en quittant la page. Comparez les extraits OCR au document d’origine, en particulier les chiffres et les unités.
- La commande vocale sélectionne un des cinq thèmes et peut lire le thème et le nombre de références. Français, arabe et darija marocaine sont proposés selon les langues disponibles sur l’appareil. La reconnaissance exige un mode local du navigateur et la lecture une voix locale. En cas d’indisponibilité, le formulaire reste utilisable au clavier. Le navigateur peut proposer le téléchargement d’un module de langue.
- L’inscription publique ne peut plus attribuer le rôle super-administrateur. Le nom administratif réservé reste indisponible à l’inscription. Les comptes administratifs se gèrent via une procédure d’exploitation contrôlée. Examiner les comptes administratifs déjà créés avant une mise en ligne.

## Exécution et dépendances

Node 22.13 ou supérieur est requis. Installer les dépendances avec `npm ci` et exécuter `npm test`. Les librairies de lecture sont PDF.js 6.5.438, Tesseract.js et son moteur 7.0.0, avec des dictionnaires français, arabe et anglais. Les composants sont servis par l’API du projet via une liste de fichiers autorisés. Aucune migration Supabase supplémentaire.

L’activation de la synthèse pilote utilise les variables serveur `EVIDENCE_AI_ENABLED=true`, `EVIDENCE_MODEL` (modèle compatible Chat Completions et JSON), `EVIDENCE_PILOT_USER_IDS` (identifiants approuvés, séparés par des virgules) et `OPENAI_API_KEY`. Le modèle reçoit le thème public, les résumés et les passages de synthèse. L’option `store: false` désactive le stockage de la complétion par cette option. Les autres conditions de conservation relèvent du contrat et de la configuration du compte. [Documentation OpenAI sur les données](https://developers.openai.com/api/docs/guides/your-data)

## Vérifications

- Les cinq tests automatisés couvrent les variables d’entrée, les filtres de licence, les citations et extraits inventés, le refus par le second agent, les pannes amont et la liste des ressources documentaires.
- Chrome a ouvert le module depuis l’espace médecin avec une session fictive. Le mode approfondi a affiché six références réelles d’Europe PMC et signalé une recherche partielle. Les requêtes hors session, hors rôle et avec un champ supplémentaire ont été refusées.
- Chrome a lu six documents synthétiques, dont un TXT, un PDF texte, un PDF scanné, deux PNG et un JPEG. L’OCR français, arabe et anglais, l’effacement et le refus de l’inscription administrative ont été vérifiés. Les seules requêtes émises pendant la lecture étaient des GET de composants locaux sans corps.
- La sélection vocale des trois langues et l’orchestration de la synthèse ont été testées avec des réponses simulées. Le microphone, la synthèse vocale réelle et le modèle OpenAI réel restent à vérifier sur leurs environnements respectifs.

## Publication et revue clinique

Les changements sont dans la copie locale du dépôt [Vitagro/Sant-connect](https://github.com/Vitagro/Sant-connect). L’accès GitHub est en lecture seule et Vercel a refusé l’accès au projet de l’équipe ainsi que la création d’un lien d’autorisation. Aucun projet SantéConnect n’a été identifié côté Supabase dans le compte accessible. Le site référencé dans la configuration du conteneur mobile répond publiquement. [Site Vercel](https://sante-connect-xi.vercel.app)

Avant la mise en ligne, vérifier le déploiement, la durée maximale de la fonction et le parcours sur les appareils cibles. Le budget du module est de 22 secondes pour la recherche et de 6,5 secondes pour chacun des deux appels modèle. Les quotas sont locaux à chaque instance. Avant toute activation clinique, faire vérifier par des cliniciens la sélection des sources, les omissions, les citations, les limites, la qualité OCR sur données synthétiques représentatives et les critères d’abstention.
