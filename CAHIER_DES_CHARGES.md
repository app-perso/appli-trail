# Appli Trail — cahier des charges

> Document de référence pour Claude Code. À lire en entier avant d'écrire la moindre ligne de code.
> Propriétaire : Timothée, traileur, **débutant complet en code et en GitHub**.

---

## 0. Règles de travail pour Claude Code

1. **Explique simplement.** Timothée ne sait pas coder. À chaque étape, dis en 2-3 phrases ce que tu as fait et ce qu'il doit vérifier, sans jargon (ou en l'expliquant).
2. **100 % gratuit.** Aucun service payant, aucune clé d'API payante, aucun abonnement. Si une fonctionnalité semble l'exiger, propose une alternative gratuite et demande avant.
3. **Petites étapes.** Une fonctionnalité à la fois, testable sur iPhone, puis commit avec un message clair en français.
4. **Pas de données personnelles dans le dépôt.** Le dépôt GitHub est public (hébergement gratuit). Les séances, sensations, sommeil, douleurs restent **uniquement sur l'appareil** (voir §3). Aucun fichier Excel personnel commité.
5. **Demande avant d'ajouter une dépendance** qui n'est pas listée au §2.
6. **Mobile d'abord.** Tout est pensé pour un iPhone (largeur 390 px), utilisable d'une main, cibles tactiles ≥ 44 px.
7. **Français partout** dans l'interface. Nombres au format français (virgule décimale, espace pour les milliers : « 1 650 m »).

---

## 1. Objectif

Une appli personnelle de suivi d'entraînement trail, **très visuelle, esthétique et intuitive**, pour préparer la saison 2027 sans se blesser :

- Chianti by UTMB (20 mars 2027, 74 km / 3 000 m D+)
- Maxi-Race demi-tour du lac (30 mai 2027, ~56 km / ~3 300 m D+)
- **Val d'Aran by UTMB, course TDL (7 juillet 2027, 75 km / 5 100 m D+) — objectif principal**

Historique à afficher aussi : Marathon du Mont-Blanc (juin 2026, 44 km / 2 540 m, 7h13), 5 Collines de Garches (22 nov. 2026, 16,2 km / 275 m), Trail du Soleil Levens (29 nov. 2026, 61,7 km / 3 870 m).

Le cœur de l'appli :
- un **check-in du matin** (sommeil, forme, moral, douleurs, lieu, temps dispo) ;
- un **débrief après chaque séance** par **curseurs uniquement** (aucun texte obligatoire) + **captures Suunto lues automatiquement** ;
- une **progression très prudente du volume** (couloir de sécurité) et des **alertes de charge** ;
- un **plan d'entraînement modifiable** et **exportable en Excel**.

---

## 2. Stack technique (imposée, tout gratuit)

| Besoin | Choix |
| --- | --- |
| Appli | React + TypeScript + Vite |
| Installable sur iPhone, hors ligne | PWA avec `vite-plugin-pwa` (manifest + service worker, icône, plein écran) |
| Stockage des données | IndexedDB sur l'appareil, via **Dexie** |
| Lecture des captures Suunto | **Tesseract.js** (OCR dans le navigateur, langue `fra` + `eng`), aucun serveur |
| Export / import Excel | **ExcelJS** (styles, largeurs de colonnes, formats) |
| Lecture GPX | Parseur XML natif du navigateur (`DOMParser`) |
| Graphiques | SVG écrits à la main (pas de librairie de graphiques) |
| Polices | Archivo (titres, chiffres) et Inter (texte), via Google Fonts, auto-hébergées si possible |
| Hébergement | **GitHub Pages**, déployé par une GitHub Action à chaque push sur `main` |
| Routage | Hash router (compatible GitHub Pages) |

Pas de backend, pas de compte utilisateur, pas d'API externe payante.

---

## 3. Données et sauvegarde

Toutes les données vivent dans IndexedDB sur le téléphone. Pour ne rien perdre :

- **Sauvegarde** : bouton « Exporter une sauvegarde » → fichier `.json` complet (via le partage iOS / téléchargement).
- **Restauration** : bouton « Importer une sauvegarde » → remplace ou fusionne (demander).
- **Rappel** : bannière discrète si la dernière sauvegarde date de plus de 7 jours.
- **Import Excel initial** : importer le fichier existant `Prepa_Trail_Soleil_Levens_v18.xlsx` (format décrit au §8) pour récupérer l'historique des séances depuis le 29/09/2026.

### Modèle de données (Dexie)

```ts
Race        { id, name, shortName, date, distanceKm, elevationGain, elevationLoss?, status: 'done'|'planned',
              resultTime?, goalTime?, notes?, gpx?: string, isMain?: boolean }
PlannedSession { id, date, week: 'S1'..., phase, type: 'Running'|'Renfo'|'Vélo'|'Rando'|'Repos'|'Course',
              isKey: boolean, title, durationMin?, distanceKm?, elevationGain?, intensity?, instructions? }
Activity    { id, plannedSessionId?, date, type, durationMin, distanceKm, elevationGain, elevationLoss,
              hrAvg?, hrMax?, zones?: [z1,z2,z3,z4,z5] (fractions 0-1), elapsedMin?, screenshots?: Blob[],
              feelings: { plaisir, fatigue, flemme, moral, estomac } (0-10),
              pains: { zone: string, score: 0-10 }[], rpe?: 1-10, note?: string,
              nutrition?: { carbsG?: number, notes?: string } }
CheckIn     { id, date, bedTime: 'HH:MM', wakeTime: 'HH:MM', sleepQuality: 1-5, forme: 0-10, moral: 0-10,
              pains: { zone, score }[], location: 'Nice'|'Saint-Cloud'|string, availableMin?: number }
Route       { id, location, name, tag: 'WE choc'|'Plaisir'|'Repérage'|'Qualité', distanceKm, elevationGain,
              access?, note? }
Settings    { hrRest: 65, hrMax: 198, zones (calculées Karvonen), theme: 'auto'|'jour'|'nuit',
              lastBackupAt? }
```

---

## 4. Règles de calcul (le « coach » de l'appli)

- **km-effort** = km + D+ / 100.
- **Durée de sommeil** = lever − coucher (gère le passage de minuit). Coucher cible : 23h.
- **Zones FC (Karvonen)** : FC repos 65, FC max 198 → Z1 132-145, Z2 145-158, Z3 158-171, Z4 171-185, Z5 185-198. Modifiables dans Réglages.
- **Volume hebdo** : semaines du lundi au dimanche ; km à pied = course + rando ; idem D+, D−, temps.
- **Couloir de sécurité** (progression) : plafond de la semaine N = moyenne des 3 semaines précédentes × 1,15 (s'il y en a moins de 3, prendre celles disponibles). Une semaine au-dessus = barre corail + alerte.
- **Récupération** : suggérer 1 semaine allégée (−25 à −35 %) toutes les 4 semaines.
- **Ratio de charge** = km-effort des 7 derniers jours ÷ (km-effort des 28 derniers jours / 4). Zones : < 0,8 bas · 0,8-1,3 équilibré (vert) · 1,3-1,5 attention (ambre) · > 1,5 risque (corail).
- **Alerte descente** : D− cumulé sur 2 jours > 2 000 m, ou D− de la semaine > 1,3 × moyenne des 4 semaines précédentes.
- **Alerte forme** : forme ≤ 2/10 deux matins de suite, ou qualité de sommeil ≤ 2/5 trois nuits sur 7 → proposer d'alléger la séance du jour.
- **Règles douleur genou / cheville** (affichées quand une douleur est saisie) :
  - 0-2 et disparue le lendemain → on suit le plan.
  - 3-4, ou encore là au réveil, ou gêne en descente → séance suivante sans dénivelé / vélo, pas de hausse de volume.
  - ≥ 5, gonflement, boiterie → arrêt de la course, avis kiné / médecin.
- **Feu vert du jour** (accueil) : vert / ambre / rouge à partir du check-in (sommeil, forme, douleur max) et du ratio de charge.
- **Nutrition** : cible 60-80 g de glucides / h ; produits validés : iso 34 g/dose, compote Decathlon 22-28 g, gel coca caféiné 24 g. À éviter : barre Overstims citron-gingembre.

---

## 5. Design system

Référence visuelle : les maquettes dans `maquettes/` (fichiers `P_*.dc.html`, direction « Doux & premium »). Ce sont des maquettes statiques : **s'en inspirer fidèlement pour les couleurs, typos, formes et mises en page**, pas pour le code.

### Couleurs — thème jour

| Rôle | Valeur |
| --- | --- |
| Fond | `#F7F4FA` + 2 halos flous (pêche `rgba(255,190,160,.55)`, lavande `rgba(196,182,255,.45)`) |
| Texte | `#1E1B2E` · secondaire `#6F6A86` |
| Cartes | `rgba(255,255,255,.88)`, rayon 28 px, ombre `0 14px 40px rgba(70,50,140,.10)` |
| Dégradé corail (action, objectif, alerte) | `#FF5F6D → #FF8A5C → #FFB36B` |
| Dégradé vert d'eau (OK, fait, D+) | `#1FC8A5 → #8BE8C3` (texte `#14A98A`) |
| Dégradé violet (renfo, sommeil, moral) | `#7A6BFF → #C6A8FF` |
| Neutre profil / à venir | `#B9B2D8`, remplissage `rgba(160,150,210,.28)` |
| Pastilles | fond blanc 85 %, rayon 999 px, hauteur 30 px |

### Thème nuit

Fond `#0E0C1F`, texte `#F3F0FF`, secondaire `#A49FC4`, cartes `rgba(255,255,255,.06)` + bordure `rgba(255,255,255,.10)`, halos corail et violet très atténués. Bascule automatique selon le réglage iOS, forçable dans Réglages.

### Typographie

- **Archivo**, largeur 118 % (`font-stretch`), graisse 800, interlettrage −0,03 em : grands chiffres (jours restants ~70 px), titres d'écran (26-30 px), noms de courses.
- **Inter** 400-700 : tout le reste (13-15 px).

### Composants

- Barre de navigation **flottante en pilule** en bas (4 icônes : Objectif, Check-in, Charge, Parcours), onglet actif = pastille sombre.
- Boutons d'action principaux : pilule pleine largeur, hauteur 56 px, dégradé corail.
- **Curseurs** : piste 6 px arrondie, remplissage en dégradé, poignée blanche 24 px avec ombre ; valeur affichée à droite du libellé.
- Contrôles segmentés en pilule (Nice / Saint-Cloud, km / D+ / D− / Temps).
- Animations sobres (150-250 ms), retour haptique si disponible.

---

## 6. Écrans

Voir les maquettes correspondantes dans `maquettes/`.

1. **Accueil** (`P_Accueil`)
   - En haut : date de la course sélectionnée, grand nombre de **jours restants**, nom de la course, pastilles distance · D+ · km-effort. Pas de date du jour, pas de « Bonjour », pas de localisation.
   - Carte **« Saison 2027 »** : profil d'altitude façon trail, chaque course = un sommet, **hauteur proportionnelle au km-effort**, position selon la date. Toucher un sommet = le haut de l'écran affiche cette course. Partie aujourd'hui → course sélectionnée en dégradé corail. Bouton « Toutes mes courses → ».
   - Carte **« Cette semaine »** : 3 anneaux concentriques (km, D+, renfo) réalisé / prévu.
   - Carte **« Aujourd'hui »** : une ligne par séance du jour (plusieurs possibles : sortie + renfo), avec icône colorée, résumé et rond à cocher → ouvre le débrief.
2. **Mes courses** (`P_Courses`)
   - 3 tuiles : courses finies, plus longue, « prochaine marche » (ratio de km-effort entre la prochaine course et la plus grosse déjà finie).
   - Profil de progression : toutes les courses comme sommets (passées en vert, à venir en lavande, sélectionnée en corail), trait « Auj. ».
   - Fiche de la course touchée (date, statut « Fini · temps » ou « J-x », pastilles, note, km-effort/h pour les courses finies).
   - Liste complète. Ajouter / modifier / supprimer une course, saisir le temps réalisé, attacher un GPX.
3. **Check-in du matin** (`P_Checkin`) — une fois par jour : frise de la nuit (coucher → lever, cible 23h), qualité 1-5, curseurs forme et moral, pastilles douleurs (+ zone), lieu, temps dispo. **Le sommeil n'est saisi qu'ici.**
4. **Débrief de séance** (`P_Debrief`)
   - « J'ai fait ma séance » → ajout de **captures Suunto** (plusieurs), OCR, **écran de vérification** des valeurs extraites (modifiables) : distance, durée, D+, D−, FC moy/max, % zones.
   - **Curseurs** 0-10 : plaisir, fatigue après, flemme avant de partir, moral après, estomac ; douleurs par zone ; note libre optionnelle.
   - **Débrief renfo** simplifié : fait / pas fait, durée, curseurs difficulté et plaisir, douleur.
5. **Charge & alertes** (`P_Charge`) : ratio de charge sur jauge dégradée, tuiles km-effort / D+ / D− (avec écart à la moyenne), barres jour par jour (fait plein, prévu en pointillé, renfo en point violet), cartes d'alerte.
6. **Progression** (`P_Progression`) : barres par semaine (vert dans le couloir, corail au-dessus, prévu en pointillé), bande du couloir de sécurité, onglets km / D+ / D− / Temps, carte d'alerte, rappels « +10 à 15 %/sem » et « 1 semaine allégée sur 4 ».
7. **Parcours** (`P_Parcours`) : bascule Nice / Saint-Cloud, carte stylisée du parcours sélectionné, liste d'idées de sorties avec étiquette colorée (WE choc corail, Plaisir vert, Repérage / Qualité violet). Modifiable (ajout de ses propres parcours).
8. **Plan de course** (`P_Course`) : import d'un **GPX** → profil en dégradé, découpage en sections (aux ravitos saisis), pour chaque section km, D+/D−, heure de passage selon un objectif de temps, consignes, glucides ; tuiles objectif / arrivée / marge barrière.
9. **Plan d'entraînement** (*pas de maquette : à concevoir dans le même style*) : vue semaine (lundi → dimanche) avec cartes de séances, ⭐ séance clé, glisser pour déplacer une séance, toucher pour modifier ; totaux prévus vs faits ; **bouton « Exporter en Excel »**.
10. **Réglages** : FC repos / max, thème, sauvegarde / restauration, import Excel, à propos.

---

## 7. Lecture des captures Suunto (OCR gratuit)

- Captures de l'appli Suunto en français, thème sombre (écrans « Stats » : Durée, Distance, Allure, Élévation, Fréquence cardiaque, Zones FC, Tours).
- Tesseract.js dans un Web Worker, prétraitement (niveaux de gris, inversion si fond noir, contraste).
- Repérer les libellés puis la valeur qui suit : `Distance` → km, `Durée` → h:mm'ss, `Ascension` / `Descente` → m, `Fréquence cardiaque m…` (moy. puis max), zones `5 4 3 2 1` + pourcentages.
- **Toujours** afficher les valeurs trouvées pour validation et correction avant d'enregistrer. Un champ non trouvé reste vide et se saisit à la main.
- Garder les captures dans IndexedDB (option « ne pas conserver les images » dans Réglages pour économiser la place).

---

## 8. Export (et import) Excel

Reproduire la structure du fichier actuel `Prepa_Trail_Soleil_Levens_v18.xlsx`, décrite ci-dessous. Le fichier lui-même n'est **pas** dans le dépôt (données personnelles) : Timothée l'importera directement dans l'appli.

**Feuille `Plan`** — ligne 1 : titre ; ligne 4 : en-têtes ; une ligne par jour à partir de la ligne 5 :

| Col | Contenu |
| --- | --- |
| A | Semaine (S0, S1…) |
| B | Phase |
| C | Date (jj/mm) |
| D | Jour (Lun…Dim) |
| E | Type (Running, Repos, Vélo, Rando, Renfo, Course) |
| F | Clé (⭐) |
| G | Séance |
| H | Durée prévue (min) |
| I | Distance prévue (km) |
| J | D+ prévu (m) |
| K | Intensité |
| L | Consignes |
| M | Durée réalisée (min) |
| N | Distance réalisée (km) |
| O | D+ réalisé (m) |
| P | FC moyenne |
| Q | FC max |
| R-V | % temps en zone 1 à 5 (format %) |
| W | RPE (1-10) |
| X | Douleur genou (0-10) |
| Y | Forme matin (1-5) |
| Z | Sommeil (1-5) |
| AA | Commentaire / sensations (généré à partir des curseurs, douleurs, note) |

**Feuille `Synthèse hebdo`** : une ligne par semaine (Semaine, Du, Au, Phase, Séances running, Running h:mm, km à pied prévus, D+ prévu, Vélo h:mm, Rando h:mm, Total h:mm, Évolution km vs S-1, km réalisés), avec des **formules Excel** (SUMIFS sur la feuille Plan) comme dans le fichier d'origine.

**Feuille `Zones & règles`** : FC repos / max, tableau des zones (Karvonen), règles genou / cheville / progression / nutrition (texte du §4).

En-têtes en gras, colonnes réalisées sur fond jaune pâle, lignes ⭐ en gras, largeurs de colonnes lisibles. Nom du fichier : `Plan_trail_AAAA-MM-JJ.xlsx`.

L'**import** lit la même structure pour amorcer l'historique (séances prévues + réalisées).

---

## 9. Données initiales (seed, non personnelles)

- Courses du §1 avec dates, distances, D+.
- Parcours :
  - Nice : Boucle Mont Bastide (11,5 km / 810 m, TER ou bus Zou 602 Èze), Boucle de Menton (19 km / 1 230 m), Levens ↔ Mont Férion (15 km / 700 m), Beaulieu → Nice (15 km / 670 m), Tourrette-Levens → Èze bord de mer (21,3 km / 1 134 m).
  - Saint-Cloud : Côtes du parc (~18 km / ~800 m, répétitions), Butte hamster (10 km / 400-600 m), Parc vallonné (16 km / 330 m), Bords de Seine (18-20 km, plat).

---

## 10. Étapes de développement

Chaque étape se termine par : déploiement sur GitHub Pages, test sur l'iPhone de Timothée, petit récapitulatif en français.

1. **Fondations** — projet Vite + React + TS, PWA installable, déploiement GitHub Pages, thème (couleurs, polices, halos, cartes), navigation flottante, base Dexie, Réglages avec sauvegarde / restauration JSON.
2. **Saisie quotidienne** — Check-in du matin, Débrief (curseurs + douleurs + note), débrief renfo, liste des séances du jour sur l'Accueil.
3. **Captures Suunto** — upload, OCR Tesseract.js, écran de vérification.
4. **Plan & Excel** — écran Plan d'entraînement modifiable, import du fichier v18, export Excel (3 feuilles).
5. **Analyse** — Charge & alertes, Progression (couloir), anneaux de la semaine, feu vert.
6. **Courses** — Accueil complet (profil saison interactif), Mes courses, Plan de course depuis un GPX.
7. **Parcours** et finitions (mode nuit, animations, accessibilité, icône de l'appli).
