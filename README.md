# Gestion CT — Application de gestion des ressources

Application web de gestion des ressources d'une compagnie de transport (CT) : personnels, véhicules et missions, avec calendrier intégré.

Auteur: Kévin Jordil

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

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Vue 3 (Composition API) + Vite |
| État | Pinia 3 |
| Routage | Vue Router 4 |
| Style | Tailwind CSS 3 |
| Backend | Express 4 (Node.js) |
| Stockage | Fichiers JSON (`data/`) avec mutex async et écriture atomique |

---

## Prérequis

- **Node.js** 18 ou supérieur
- **npm** 9 ou supérieur

---

## Installation

```bash
# Cloner ou copier le projet, puis :
cd app
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

> Les données sont stockées dans le dossier `data/` à la racine du projet (créé automatiquement). Au premier lancement sans données existantes, des données de démonstration sont chargées.

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

Pour changer le port :

```bash
PORT=8080 node server.js
```

---

## Structure du projet

```
app/
├── data/                  # Données JSON (créé automatiquement)
│   ├── persons.json
│   ├── vehicles.json
│   └── missions.json
├── src/
│   ├── api.js             # Client HTTP (load / save)
│   ├── utils.js           # Helpers partagés (formatDT, getMissionStatut, …)
│   ├── stores/            # Stores Pinia
│   │   ├── persons.js
│   │   ├── vehicles.js
│   │   └── missions.js
│   ├── components/
│   │   ├── common/        # BaseModal, ConfirmModal, StatusBadge
│   │   ├── persons/       # PersonCard, PersonForm, CongesModal, PersonIndisponibleModal
│   │   ├── vehicles/      # VehicleCard, VehicleForm, LoanModal
│   │   ├── missions/      # MissionCard, MissionForm
│   │   └── calendar/      # CalendarGrid (mois), CalendarTimeline (jour/semaine)
│   └── views/
│       ├── DashboardView.vue
│       ├── PersonsView.vue
│       ├── VehiclesView.vue
│       ├── MissionsView.vue
│       └── CalendarView.vue
├── server.js              # Serveur Express
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Sauvegarde des données

Les données sont persistées dans des fichiers JSON dans le dossier `data/`. Pour sauvegarder ou migrer :

```bash
# Sauvegarder
cp -r data/ data_backup/

# Restaurer
cp -r data_backup/ data/
```

Pour repartir des données de démonstration, supprimer les fichiers JSON :

```bash
rm data/*.json
```
