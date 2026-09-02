# Gestion CT — Application de gestion des ressources

Application web de gestion des ressources d'une compagnie de transport (CT) :
personnels, véhicules et missions, avec calendrier intégré. Les statuts
(disponible, en mission, en congé, en prêt) se déduisent des dates saisies,
et les conflits d'affectation sont détectés à la saisie.

Interface disponible en **français, allemand et italien**.

Vue 3 · Pinia · Tailwind · Express · stockage en fichiers JSON, sans base de
données à installer.

Auteur : Kévin Jordil

## Aperçu

**Tableau de bord** — disponibilités en un coup d'œil, missions en cours et
alertes automatiques (chauffeur en congé, véhicule prêté pendant une mission).

![Tableau de bord](docs/dashboard.png)

**Calendrier** — vues jour, semaine et mois, sur les véhicules ou le
personnel. Les chevauchements sont empilés sur plusieurs pistes et la ligne
rouge marque l'heure actuelle.

![Calendrier](docs/calendrier.png)

**Missions** — filtrage par statut, affectation de plusieurs véhicules avec
ou sans chauffeur, et contrôle des permis requis par catégorie de véhicule.

![Missions](docs/missions.png)

**Personnes** — permis militaires suisses, congés et indisponibilités.

![Personnes](docs/personnes.png)

**Multilingue** — toute l'interface bascule en allemand ou en italien depuis
le sélecteur en bas de la barre latérale, y compris les noms de jours et de
mois du calendrier.

![Tableau de bord en allemand](docs/dashboard-de.png)

> Les captures utilisent le jeu de démonstration livré avec le projet, dont
> les dates sont recalées sur le jour de l'installation.

## Fonctionnalités

### Personnes
- Fiche par personne avec **grade**, prénom, nom, permis de conduire et notes
- **Congés** : ajout de périodes de congé avec date/heure précises
- **Indisponibilité** : marquage d'une personne indisponible avec commentaire (garde, affectation temporaire, etc.)
- Statut calculé automatiquement : *disponible*, *en congé*, *indisponible*

### Véhicules
- Fiche par véhicule avec nom, immatriculation, catégorie (léger / moyen / lourd)
- Statut dynamique : *libre*, *en mission* (calculé depuis les missions actives), *en prêt* (manuel avec commentaire)
- Mise en prêt et libération depuis la fiche véhicule

### Missions
- Titre, description, dates de début et fin avec précision à l'heure
- Affectation de **plusieurs véhicules** par mission, chacun avec ou sans chauffeur
- Affectation de **personnel sans véhicule** (personnel libre)
- Statut **automatique** calculé depuis les dates : *planifiée*, *en cours*, *terminée* — aucune saisie manuelle
- Filtrage par statut, compteurs en temps réel
- Les personnes en congé, indisponibles ou déjà affectées sont exclues des listes de sélection
- Les véhicules en prêt ou déjà engagés sur la même période sont exclus

### Tableau de bord
- Vue synthétique : disponibilités personnes et véhicules, missions en cours
- Alertes automatiques (chauffeur en congé pendant une mission, véhicule en prêt sur une mission active, etc.)

### Calendrier
Trois modes de visualisation, deux onglets de ressources (Véhicules / Personnes) :

| Mode | Description |
|------|-------------|
| **Jour** | Timeline sur 24 h, précision à l'heure |
| **Semaine** | Timeline du lundi au dimanche |
| **Mois** | Diagramme de Gantt mensuel |

- Indicateur de l'heure actuelle (ligne rouge) en vue jour/semaine
- Superposition des événements gérée par empilement de pistes (*lane packing*)
- Congés visibles dans l'onglet Personnes
- Navigation prev/next et bouton *Aujourd'hui*

---

## Langues

L'interface est traduite en **français**, **allemand** et **italien**. La
langue se choisit depuis la barre latérale ; le choix est conservé dans le
navigateur. Au premier accès, la langue est déduite des préférences du
navigateur, avec le français par défaut.

Les noms de jours et de mois du calendrier viennent d'`Intl`, ils suivent donc
la langue active sans table de correspondance à maintenir.

### Ajouter une langue

1. Copier `src/locales/fr.json` vers `src/locales/<code>.json` et traduire les
   valeurs (les clés ne changent pas).
2. Déclarer la langue dans `src/i18n/index.js` : l'ajouter à
   `SUPPORTED_LOCALES` (code, libellé, balise `Intl`) et au dictionnaire
   `messages`.

Les tests vérifient que les trois catalogues ont exactement les mêmes clés ;
une clé oubliée est donc détectée avant la mise en production.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Vue 3 (Composition API) + Vite |
| État | Pinia 3 |
| Routage | Vue Router 4 |
| Style | Tailwind CSS 3 |
| Backend | Express 4 (Node.js) |
| Stockage | Fichiers JSON (`data/`) avec mutex async et écriture atomique |
| Traductions | vue-i18n 11 (fr / de / it) |
| Tests | Vitest + Vue Test Utils |

---

## Prérequis

- **Node.js** 18 ou supérieur
- **npm** 9 ou supérieur

---

## Installation

```bash
# Cloner ou copier le projet, puis :
npm install
```

---

## Lancement en développement

```bash
npm run dev
```

Cette commande démarre en parallèle :
- le serveur Express sur **http://localhost:3000** (API + stockage)
- le serveur de développement Vite sur **http://localhost:5173** (hot reload)

Ouvrir **http://localhost:5173** dans le navigateur.

> Les données sont stockées dans le dossier `data/` à la racine du projet
> (créé automatiquement, non versionné). Au premier lancement, chaque
> collection absente est initialisée depuis `data.example/`, avec les dates
> recalées sur le jour de l'installation : le tableau de bord et le calendrier
> montrent donc immédiatement une activité réaliste.

---

## Tests

```bash
npm test          # une passe
npm run test:watch
```

La suite couvre les helpers de date et la logique de disponibilité, la
migration des anciens formats, la validation côté serveur, le recalage du jeu
de démonstration, le store de collection (versions, conflits, garde
anti-écrasement), la navigation du calendrier, les vues dans les trois
langues, et le serveur de bout en bout (authentification, validation,
concurrence).

---

## Build de production

```bash
npm run build
```

Le frontend est compilé dans `dist/`. Le serveur Express sert ensuite les fichiers statiques.

### Lancement en production

```bash
npm run server
# ou
node server.js
```

Ouvrir **http://localhost:3000**.

### Configuration

| Variable | Défaut | Rôle |
|----------|--------|------|
| `PORT` | `3000` | Port d'écoute |
| `DATA_DIR` | `./data` | Dossier des fichiers JSON |
| `SEED_DIR` | `./data.example` | Données de démonstration du premier lancement |
| `CT_TOKEN` | *(vide)* | Clé d'accès à l'API — voir ci-dessous |
| `CORS_ORIGIN` | *(vide)* | Origine autorisée si le frontend est servi ailleurs |

```bash
PORT=8080 CT_TOKEN=une-cle-longue-et-aleatoire node server.js
```

### Sécurité

L'API n'est **pas** protégée par défaut : c'est confortable en local, mais un
`PUT /api/persons` remplace l'intégralité d'une collection. Dès que
l'application est accessible depuis un réseau, définissez `CT_TOKEN` :

```bash
CT_TOKEN="$(openssl rand -hex 24)" node server.js
```

Le navigateur demande alors la clé au premier accès et la conserve
localement. Sans `CT_TOKEN`, le serveur affiche un avertissement au démarrage.

En développement, Vite proxifie `/api` vers le serveur Express : les requêtes
sont de même origine et aucun en-tête CORS n'est nécessaire. `CORS_ORIGIN`
n'est utile que si le frontend est servi depuis une autre origine.

### Modifications concurrentes

Chaque lecture renvoie une version (`ETag`) et chaque écriture doit la
présenter (`If-Match`). Si deux onglets modifient la même collection, le
second reçoit un `409` et l'interface propose de recharger, au lieu d'écraser
silencieusement le travail du premier.

---

## Structure du projet

```
ct_manager/
├── data/                  # Données de travail (créé au 1er lancement, non versionné)
├── data.example/          # Données de démonstration servant d'amorçage
├── docs/                  # Captures d'écran du README
├── src/
│   ├── api.js             # Client HTTP (clé d'accès, versions, erreurs typées)
│   ├── constants.js       # Vocabulaire métier : statuts, catégories, permis
│   ├── datetime.js        # Dates en heure locale (jamais toISOString)
│   ├── availability.js    # Règles métier : statuts et disponibilité
│   ├── migrations.js      # Lecture des formats de données antérieurs
│   ├── labels.js          # Helpers d'affichage partagés
│   ├── id.js              # Génération d'identifiants
│   ├── i18n/              # Configuration vue-i18n et formats de dates
│   ├── locales/           # fr.json, de.json, it.json
│   ├── stores/            # Stores Pinia
│   │   ├── collection.js  # Squelette commun aux trois collections
│   │   ├── clock.js       # Horloge réactive partagée
│   │   ├── sync.js        # État de synchronisation (erreurs, conflits)
│   │   ├── persons.js
│   │   ├── vehicles.js
│   │   └── missions.js
│   ├── components/
│   │   ├── common/        # BaseModal, ConfirmModal, StatusBadge, ListPlaceholder, AccessKeyModal, LanguageSwitcher
│   │   ├── persons/       # PersonCard, PersonForm, LeavesModal, PersonUnavailableModal
│   │   ├── vehicles/      # VehicleCard, VehicleForm, LoanModal
│   │   ├── missions/      # MissionCard, MissionForm
│   │   └── calendar/      # CalendarGrid (mois), CalendarTimeline (jour/semaine)
│   ├── views/
│   │   ├── DashboardView.vue
│   │   ├── PersonsView.vue
│   │   ├── VehiclesView.vue
│   │   ├── MissionsView.vue
│   │   └── CalendarView.vue
│   └── __tests__/         # Tests unitaires et de composants
├── test/                  # Tests d'intégration du serveur
├── server.js              # Serveur Express
├── validation.js          # Validation des collections reçues par l'API
├── seed.js                # Recalage des dates du jeu de démonstration
├── vite.config.js
├── vitest.config.js
├── tailwind.config.js
└── package.json
```

### Conventions

- **Le code est en anglais** — noms, commentaires, schéma de données, valeurs
  de statut. Le français, l'allemand et l'italien n'existent que dans
  `src/locales/` et dans ce README. Aucun texte affiché n'est écrit en dur
  dans un composant : tout passe par une clé de traduction.
- **Les dates sont des chaînes locales** (`YYYY-MM-DDTHH:mm`), comparables
  directement. `toISOString()` est proscrit pour les produire : il convertit
  en UTC et décale le résultat d'une à deux heures — donc parfois d'un jour.
  Tout passe par `src/datetime.js`.
- **L'instant courant vient de `useClock()`**, jamais de `new Date()` dans un
  `computed` : Vue ne trace pas le temps comme dépendance, et les statuts
  cesseraient de se rafraîchir.
- **Les statuts ne sont pas stockés** : mission (`planned` / `ongoing` /
  `completed`) et véhicule (`free` / `on-mission`) se déduisent des dates.
- **Les erreurs de l'API sont des codes**, pas des phrases : le serveur
  renvoie `{code, params}` et l'interface les rend dans la langue du lecteur.

### Modèle de données

Les fichiers JSON utilisent des clés anglaises :

| Collection | Champs |
|------------|--------|
| `persons` | `id`, `rank`, `firstName`, `lastName`, `licenses[]`, `notes`, `leaves[{id, startDate, endDate}]`, `unavailable`, `unavailabilityNote` |
| `vehicles` | `id`, `name`, `plate`, `category`, `status`, `loanNote`, `seats` |
| `missions` | `id`, `title`, `description`, `startDate`, `endDate`, `notes`, `vehicles[{id, vehicleId, driverId, withTrailer}]`, `staffIds[]` |

Les fichiers écrits par une version antérieure — schéma français, statut de
véhicule stocké, mission à véhicule unique, permis civils — sont convertis au
chargement par `src/migrations.js`. La conversion est couverte par des tests
et ne demande aucune intervention manuelle.

---

## Sauvegarde des données

Les données sont persistées dans des fichiers JSON dans le dossier `data/`. Pour sauvegarder ou migrer :

```bash
# Sauvegarder
cp -r data/ data_backup/

# Restaurer
cp -r data_backup/ data/
```

Pour repartir des données de démonstration, supprimer les fichiers JSON : ils
seront réamorcés depuis `data.example/` au prochain démarrage.

```bash
rm data/*.json
```
