# Format du fichier plan — Appli Trail

> Ce document décrit le fichier **plan** que l'Appli Trail importe (Réglages → **Importer un nouveau plan**).
> Il est fait pour être donné à Claude : « Voici le format PLAN_FORMAT.md, mes données (export pour l'analyse) et mes objectifs : génère le plan du mois au format JSON valide. »
>
> Le fichier plan est **personnel** : il ne doit jamais être mis dans le dépôt GitHub (public). Il reste sur le téléphone, dans le navigateur.

---

## 1. En bref

- Un fichier **JSON** (UTF-8), une seule racine `{ … }`.
- Il décrit les **semaines à venir** (en général 4 à 6), avec leurs séances, les **règles d'alerte** que l'appli doit appliquer, et les **décisions** à ajouter au journal du coach.
- Dates au format **AAAA-MM-JJ**. Semaines du **lundi au dimanche**.
- Nombres avec un **point** décimal (`12.5`), sans unité dans la valeur (l'unité est dans le nom du champ).

## 2. Structure

```text
{
  "format":    "appli-trail-plan",        (recommandé)
  "version":   "2026-12 v1",              (obligatoire)
  "date":      "2026-12-01",              (obligatoire)
  "resume":    "…2-3 phrases…",           (obligatoire)
  "semaines":  [ { semaine }, … ],        (obligatoire, au moins une)
  "regles":    { "nom_regle": valeur, … },(facultatif)
  "decisions": [ { decision }, … ]        (facultatif)
}
```

### 2.1 Champs racine

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `format` | texte | conseillé | Toujours `"appli-trail-plan"`. |
| `version` | texte | oui | Nom de la version, ex. `"2026-12 v1"`, `"2027-01 v2 (après Chianti)"`. Affiché dans l'appli et l'historique. |
| `date` | date | oui | Date d'émission du plan (jour de l'analyse). |
| `resume` | texte | oui | 2-3 phrases sur l'orientation du mois (affichées dans les Réglages et le Journal du coach). |
| `semaines` | liste | oui | Les semaines du plan, voir 2.2. |
| `regles` | objet | non | Seuils d'alerte, voir 3. Une règle absente garde sa **valeur par défaut**. |
| `decisions` | liste | non | Enseignements et décisions datés, voir 4. |

### 2.2 Semaine

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `debut` | date | oui | **Lundi** de la semaine (une autre date est recalée sur son lundi, avec un avertissement). |
| `nom` | texte | non | Nom court, ex. `"S10"`. |
| `phase` | texte | non | Phase de la prépa, ex. `"Construction"`, `"Pic"`, `"Affûtage"`, `"Récupération"`. Affichée dans l'onglet Semaine (le « but de la semaine » s'en inspire). |
| `objectif_km` | nombre | non | Objectif de km **à pied** de la semaine (course + rando + compétition). |
| `objectif_dplus` | nombre | non | Objectif de D+ à pied de la semaine (m). |
| `note` | texte | non | Le « but de la semaine » en une phrase (remplace la phrase automatique de la phase). |
| `seances` | liste | oui | Séances de la semaine (peut être vide `[]`), voir 2.3. |

### 2.3 Séance

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `jour` | texte ou date | oui | Jour suggéré : `"lundi"` … `"dimanche"` (ou les 3 premières lettres), ou une date `AAAA-MM-JJ` de la semaine. |
| `type` | texte | oui | `course` (footing, route), `trail`, `rando`, `velo`, `renfo`, `repos`, `competition`. |
| `titre` | texte | oui* | Titre court affiché partout (≈ 40 caractères max). *Si absent, `description` sert de titre. |
| `description` | texte | non | Consignes détaillées (déroulé, allure, FC, nutrition, conditions pour la faire ou l'alléger). |
| `duree_min` | nombre | non | Durée prévue en minutes. |
| `km` | nombre | non | Distance prévue (km). |
| `dplus` | nombre | non | D+ prévu (m). |
| `intensite` | texte | non | Zones visées, ex. `"Z1-Z2"`, `"Z2 + 5×4' Z3"`, `"Z4 en côte"`. La difficulté (éclairs) se déduit de la zone la plus haute citée. |
| `cle` | booléen | non | `true` pour les **séances à ne pas rater** (3 maximum par semaine conseillé). Défaut `false`. |

Plusieurs séances peuvent tomber le même jour (ex. renfo le midi + footing le soir). Un jour de repos peut être indiqué (`"type": "repos"`) ou simplement omis.

## 3. Règles d'alerte (`regles`)

L'appli applique ces seuils pour ses alertes (écran Charge, feu du jour, Progression) et pour les **propositions d'adaptation du coach**. Toutes sont facultatives ; une valeur hors bornes rend le fichier invalide.

| Règle | Défaut | Bornes | Effet |
| --- | --- | --- | --- |
| `couloir_semaines` | 3 | 1-8 | Nombre de semaines précédentes (terminées) dont on fait la moyenne pour le couloir de sécurité. |
| `couloir_hausse_pct` | 15 | 0-50 | Hausse max (%) des km à pied d'une semaine par rapport à cette moyenne. Au-dessus : alerte « couloir dépassé » et proposition de raccourcir la plus longue sortie. |
| `hausse_max_semaine_pct` | 0 | 0-100 | Hausse max (%) par rapport à la **semaine précédente**. `0` = pas de contrôle. |
| `tolerance_pct` | 2 | 0-20 | Marge (%) avant de signaler qu'un plan dépasse un plafond. |
| `ratio_bas` | 0.8 | 0.3-1.2 | Ratio de charge (km-effort 7 j ÷ moyenne hebdo 28 j) sous lequel la charge est « basse ». |
| `ratio_attention` | 1.3 | 1-2 | Au-dessus : « attention » (pas de nouvelle hausse, grosse séance allégée de 20 %). |
| `ratio_risque` | 1.5 | 1.1-3 | Au-dessus : « risque » (grosse séance allégée de 30 %, feu rouge). |
| `dmoins_2j_max_m` | 2000 | 300-10000 | D− cumulé max sur 2 jours (m). Au-dessus : séance suivante courte et plate. |
| `dmoins_semaine_facteur` | 1.3 | 1-3 | D− de la semaine max par rapport à la moyenne des 4 semaines précédentes. |
| `forme_min` | 2 | 0-10 | Forme du matin (0-10) : à ce niveau ou moins **deux matins de suite** → séance du jour allégée. |
| `forme_orange` | 3 | 0-10 | Forme du matin à ce niveau ou moins → feu orange. |
| `qualite_sommeil_min` | 2 | 1-5 | Qualité de sommeil (1-5) à ce niveau ou moins = nuit difficile. |
| `nuits_difficiles_max` | 3 | 1-7 | Nombre de nuits difficiles sur 7 jours qui déclenche l'allègement. |
| `sommeil_min_h` | 6 | 3-10 | Nuit plus courte que ce seuil (h) → la séance du lendemain (le jour même) est allégée. |
| `fatigue_alerte` | 9 | 1-10 | Fatigue ressentie après une séance (curseur du débrief) à ce niveau ou plus → alerte et séance suivante allégée de 20 %. |
| `douleur_adapter` | 1 | 1-10 | Douleur notée au réveil à partir de ce niveau → prochaine sortie vallonnée en version plate (ou vélo). |
| `douleur_stop` | 5 | 1-10 | Douleur à partir de ce niveau → arrêt de la course, avis kiné, feu rouge. |
| `semaine_allegee_toutes_les` | 4 | 2-12 | Une semaine allégée toutes les N semaines (après N−1 semaines de construction). |
| `allegement_pct` | 30 | 5-60 | Allègement (%) proposé pour une semaine allégée ou une séance allégée. |

Le coach de l'appli ne propose **jamais** d'augmenter la charge : les règles servent à alléger, aplatir ou remplacer.

## 4. Décisions (`decisions`)

Liste datée des enseignements et décisions (texte court, une idée par entrée), affichée dans l'onglet **Journal du coach**.

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| `date` | date | oui | Date de la décision / de l'enseignement. |
| `texte` | texte | oui | 1-2 phrases. |
| `categorie` | texte | non | Ex. `charge`, `blessure`, `sommeil`, `nutrition`, `course`, `technique`, `autre`. |

Une même décision (même date et même texte) n'est jamais ajoutée deux fois.

## 5. Ce que fait l'import

1. **Vérification** du fichier. S'il est invalide, rien n'est importé et l'appli liste toutes les erreurs (ex. `semaines[1].seances[2] : type « trial » inconnu`).
2. **Aperçu** avant confirmation : semaine par semaine, séances retirées (barrées), séances ajoutées, km avant → après, règles modifiées, décisions ajoutées.
3. **Remplacement des semaines à venir uniquement** : sur la période couverte par le fichier, à partir d'aujourd'hui :
   - les séances prévues **pas encore faites** sont remplacées par celles du fichier ;
   - les séances **faites, sautées ou débriefées** (et tes ressentis) ne sont **jamais** touchées ;
   - les séances du fichier déjà passées sont ignorées ; aujourd'hui, si une séance est déjà faite, celles du fichier pour ce jour sont ignorées ;
   - les semaines hors de la période du fichier ne bougent pas.
4. Les **règles** du fichier deviennent les règles en vigueur (une règle absente reprend sa valeur par défaut).
5. Les **décisions** s'ajoutent au journal, sans effacer les anciennes.
6. **Historique** : chaque import est gardé. « Revenir à la version précédente » annule le dernier import (séances remises comme avant, règles d'avant, décisions de ce plan retirées du journal). On peut remonter version par version.

Après l'import, chaque séance reste **modifiable à la main** dans l'appli (déplacer, raccourcir, supprimer, « Je saute cette séance »).

## 6. Conseils pour générer un plan avec Claude

- Partir de l'**export pour l'analyse** de l'appli (Réglages → Export pour l'analyse) : séances, check-ins, semaines (couloir, ratio de charge), courses.
- Respecter le couloir : `objectif_km` d'une semaine ≤ moyenne des `couloir_semaines` semaines précédentes × (1 + `couloir_hausse_pct` / 100).
- Prévoir une semaine allégée toutes les `semaine_allegee_toutes_les` semaines.
- 3 séances clés maximum par semaine (`"cle": true`), le reste en endurance facile.
- Mettre dans `description` les conditions d'adaptation (« seulement si genou ≤ 2 au réveil, sinon vélo 1h »).
- Répondre avec **uniquement le JSON**, sans commentaires (le JSON n'accepte pas les commentaires).

## 7. Exemple complet

```json
{
  "format": "appli-trail-plan",
  "version": "2026-12 v1",
  "date": "2026-11-30",
  "resume": "Après le Trail du Soleil Levens, deux semaines de récupération active puis reprise progressive du volume vers Chianti. Priorité : genou gauche (pas de descentes rapides avant mi-décembre) et sommeil.",
  "semaines": [
    {
      "debut": "2026-11-30",
      "nom": "R1",
      "phase": "Récupération",
      "objectif_km": 20,
      "objectif_dplus": 300,
      "note": "Récupérer de Levens : que du facile, aucune séance difficile.",
      "seances": [
        { "jour": "mardi", "type": "velo", "titre": "Vélo très facile", "description": "45 min à plat, cadence souple, sans forcer.", "duree_min": 45, "intensite": "Z1" },
        { "jour": "jeudi", "type": "course", "titre": "Footing de déblocage", "description": "Plat strict. Stop si douleur genou ≥ 2.", "duree_min": 35, "km": 5.5, "dplus": 20, "intensite": "Z1" },
        { "jour": "samedi", "type": "rando", "titre": "Rando facile", "description": "Marche active, bâtons, descente tranquille.", "duree_min": 120, "km": 8, "dplus": 300, "intensite": "Z1", "cle": true },
        { "jour": "dimanche", "type": "repos", "titre": "Repos" }
      ]
    },
    {
      "debut": "2026-12-07",
      "nom": "R2",
      "phase": "Récupération",
      "objectif_km": 28,
      "objectif_dplus": 600,
      "seances": [
        { "jour": "lundi", "type": "renfo", "titre": "Renfo genou", "description": "Chaise 5×45'', step-downs lents, mollets, gainage.", "duree_min": 35 },
        { "jour": "mercredi", "type": "course", "titre": "Footing EF", "duree_min": 45, "km": 7.5, "dplus": 60, "intensite": "Z1-Z2" },
        { "jour": "vendredi", "type": "course", "titre": "Footing EF + lignes droites", "description": "45 min Z2 puis 5×20'' relâchées.", "duree_min": 50, "km": 8.5, "dplus": 60, "intensite": "Z2", "cle": true },
        { "jour": "dimanche", "type": "trail", "titre": "Trail vallonné tranquille", "description": "Montées en marche rapide, descentes au trot, FC < 155.", "duree_min": 90, "km": 12, "dplus": 450, "intensite": "Z1-Z2", "cle": true }
      ]
    },
    {
      "debut": "2026-12-14",
      "nom": "S1",
      "phase": "Construction",
      "objectif_km": 34,
      "objectif_dplus": 900,
      "seances": [
        { "jour": "lundi", "type": "renfo", "titre": "Renfo principal", "duree_min": 45 },
        { "jour": "mardi", "type": "course", "titre": "Footing EF", "duree_min": 45, "km": 7.5, "dplus": 80, "intensite": "Z1-Z2" },
        { "jour": "jeudi", "type": "trail", "titre": "Côtes : 6×3' Z3", "description": "20' EF + 6×3' en montée régulière (FC 158-171), récup en redescendant au pas + 10' EF.", "duree_min": 60, "km": 9, "dplus": 350, "intensite": "Z3", "cle": true },
        { "jour": "samedi", "type": "trail", "titre": "Sortie longue trail", "description": "Bâtons, nutrition toutes les 30-40 min (60-80 g/h).", "duree_min": 140, "km": 17.5, "dplus": 470, "intensite": "Z2", "cle": true }
      ]
    },
    {
      "debut": "2026-12-21",
      "nom": "S2",
      "phase": "Construction",
      "objectif_km": 38,
      "objectif_dplus": 1100,
      "note": "Semaine de Noël : garder les deux séances clés, le reste est facultatif.",
      "seances": [
        { "jour": "mardi", "type": "course", "titre": "Footing EF", "duree_min": 50, "km": 8.5, "dplus": 80, "intensite": "Z1-Z2" },
        { "jour": "mercredi", "type": "renfo", "titre": "Renfo léger", "duree_min": 30 },
        { "jour": "vendredi", "type": "trail", "titre": "Seuil en côte 5×4'", "duree_min": 60, "km": 9.5, "dplus": 380, "intensite": "Z3-Z4", "cle": true },
        { "jour": "dimanche", "type": "trail", "titre": "Sortie longue vallonnée", "duree_min": 150, "km": 20, "dplus": 640, "intensite": "Z2", "cle": true }
      ]
    }
  ],
  "regles": {
    "couloir_semaines": 4,
    "couloir_hausse_pct": 12,
    "hausse_max_semaine_pct": 20,
    "sommeil_min_h": 6.5,
    "fatigue_alerte": 8,
    "douleur_adapter": 2
  },
  "decisions": [
    { "date": "2026-11-30", "texte": "Levens bouclé : descentes finales subies, quadriceps à renforcer (step-downs, chaise) avant de remonter le D−.", "categorie": "technique" },
    { "date": "2026-11-30", "texte": "Genou gauche : pas de descente rapide avant le 14/12, puis réintroduction progressive.", "categorie": "blessure" },
    { "date": "2026-11-30", "texte": "Nutrition validée : 70 g/h (iso + compote + gel caféiné), aucun souci gastrique sur 3 sorties longues.", "categorie": "nutrition" },
    { "date": "2026-11-30", "texte": "Couloir plus prudent (+12 % sur 4 semaines) jusqu'à fin décembre.", "categorie": "charge" }
  ]
}
```
