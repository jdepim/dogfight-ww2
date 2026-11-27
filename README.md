# Dogfight WW2

Petit jeu de combat aérien en 3D voxel, ambiance Seconde Guerre mondiale, jouable dans le navigateur sur PC et sur téléphone.

Survis à des vagues d'ennemis de plus en plus dures. Anticipe leurs trajectoires pour les toucher, gère ton carburant et tes munitions, pose-toi sur la piste pour réparer… et défends-la contre les bombardiers toutes les 5 vagues.

**Jouer en ligne :** https://jdepim.github.io/dogfight-ww2/

## Commandes

**PC (clavier + souris)**
- Souris : manche (tangage / roulis). Clique dans le jeu pour capturer la souris.
- Z / W : plus de gaz · S : moins de gaz · Q / A et D : palonnier (touches physiques, AZERTY et QWERTY)
- Clic gauche ou Espace : tir · Flèches : manche au clavier
- C : caméra cible · Échap : pause

**Téléphone (en paysage)**
- Joystick à gauche : manche · Curseur à droite : gaz · Bouton FEU : tir

## Règles en bref

- Décollage : plein gaz, puis tire le manche au-dessus de 160 km/h.
- Atterrissage réussi : sur la piste, moins de 215 km/h, descente douce, ailes à plat, aligné.
- Arrêté sur la piste : plein, munitions et réparations en 5 secondes.
- Entre deux vagues : 30 secondes de pause. Enchaîner sans se poser rapporte un bonus.
- Fin de partie si tu es abattu, si tu t'écrases ou si tu tombes en panne sèche.

## Développement

```bash
npm install
npm run dev     # serveur local : http://localhost:5173/dogfight-ww2/
npm test        # tests automatiques
npm run build   # version de production dans dist/
```

Tous les réglages du jeu (vitesses, carburant, dégâts, vagues…) sont dans `src/config.ts`.

Conception : `docs/superpowers/specs/` · Plan : `docs/superpowers/plans/`.

## Mise en ligne

Le workflow `.github/workflows/deploy.yml` publie le jeu à chaque push sur `main`.
Une seule fois : dans les réglages du dépôt sur GitHub, rubrique **Pages**, choisir **GitHub Actions** comme source.
