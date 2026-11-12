# Appli Trail

Appli personnelle de suivi d'entraînement trail (PWA, 100 % gratuite).

👉 **Appli en ligne : https://app-perso.github.io/appli-trail/**

- `CAHIER_DES_CHARGES.md` : tout ce que l'appli doit faire. **Claude Code : lis-le en entier avant de commencer.**
- `maquettes/` : maquettes visuelles validées (direction « Doux & premium », police Archivo). Ce sont des références de design, pas du code à réutiliser.
- `src/` : le code de l'appli (React + TypeScript).
- `.github/workflows/deploy.yml` : publie l'appli automatiquement sur GitHub Pages à chaque envoi sur `main`.

## Avancement

- [x] Étape 1 — Fondations (PWA installable, thème jour / nuit, navigation, base de données, sauvegarde / restauration)
- [x] Étape 2 — Saisie quotidienne (check-in du matin, débrief, débrief renfo, séances du jour)
- [ ] Étape 3 — Captures Suunto
- [ ] Étape 4 — Plan & Excel
- [ ] Étape 5 — Analyse
- [ ] Étape 6 — Courses
- [ ] Étape 7 — Parcours et finitions

## Pour un développeur

```bash
npm install
npm run dev      # appli locale sur http://localhost:5173/appli-trail/
npm run build    # version finale dans dist/
```
