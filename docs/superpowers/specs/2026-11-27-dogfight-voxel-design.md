# Dogfight WW2 voxel : document de conception

Date : 2026-11-27 · Statut : validé par le joueur

## 1. Intention

Un petit jeu web 3D de combat aérien Seconde Guerre mondiale, jouable dans un navigateur sur PC (clavier + souris) et sur téléphone (joystick virtuel). Ce qui compte : **la jouabilité et le fun**, pas le réalisme graphique.

Le plaisir central, d'après le joueur :
- le **dogfight à la mitrailleuse** où l'on **anticipe la trajectoire** de l'ennemi pour tirer là où il sera ;
- le **danger du décor** : villes avec gratte-ciel, villages, risque de collision aussi en verticalité ;
- la **gestion** : décollage, atterrissage, carburant, munitions, dégâts qui dégradent le pilotage, retour à la piste pour recharger et réparer.

## 2. Objectifs

- Pilotage arcade avec un peu de physique : inertie, décrochage à basse vitesse, sensation de poids. Agréable dès la première minute.
- Balles avec temps de vol réel → le tir avec anticipation est une compétence.
- Plusieurs ennemis IA simultanés, en vagues de difficulté croissante.
- Boucle de ressources : carburant, munitions, dégâts → se poser pendant la pause pour recharger/réparer.
- Fluide sur un téléphone de milieu de gamme.

## 3. Non-objectifs (version 1)

Multijoueur, décor destructible, choix entre plusieurs avions, campagne/missions, vue cockpit, fichiers MagicaVoxel (prévu pour plus tard : le format interne des modèles doit permettre de les charger ensuite).

## 4. Anti-objectifs (échec même si « ça marche »)

- Avion pénible ou imprécis à piloter.
- Atterrissage/ravitaillement qui devient une corvée.
- Morts ressenties comme injustes : collisions invisibles, zones de touche floues, ennemis qui apparaissent dans le dos.
- Saccades sur téléphone.
- Écran surchargé d'informations.

## 5. Contraintes

- Web uniquement, aucune installation. Hébergement statique (GitHub Pages).
- Téléphone d'abord pour le budget de performance : viser 60 i/s sur PC, ≥ 30 i/s stables sur téléphone milieu de gamme, < 150 appels de rendu, chargement initial < 3 Mo.
- Téléphone en paysage (message demandant de tourner l'écran sinon).

## 6. Approches envisagées

| Approche | Compromis | Décision |
|---|---|---|
| **A. three.js + physique de vol maison** | Léger, contrôle total des sensations de vol ; tout est à coder (interface, sons) | **Retenue** |
| B. Babylon.js | Beaucoup d'outils intégrés, mais plus lourd et ces outils servent peu ici | Écartée |
| C. Godot / Unity exporté web | Exports lourds, lents sur téléphone, Safari iOS capricieux, éditeurs peu adaptés à un développement par code | Écartée |

Modèles voxel : **générés par code** (retenu) plutôt que fichiers MagicaVoxel (gardé pour plus tard).

## 7. Ce qui a été décidé avec le joueur

### 7.1 Style visuel
Voxel à petits cubes :
- **Avions** fins (~30 voxels de long), silhouettes reconnaissables, hélice animée, cocardes.
- **Bâtiments** en voxels moyens, détails « peints » dans les voxels (fenêtres, toits).
- **Sol et lointain** très simplifiés.
- Chaque modèle fusionné en un seul maillage (fusion de faces, couleurs par sommet, pas de textures).

### 7.2 Commandes
Un seul comportement de vol, deux couches de commandes.

**PC (clavier + souris, verrouillage du pointeur)**
- Souris : manche (avant/arrière = tangage, gauche/droite = roulis).
- W / S : gaz + / −. A / D : palonnier (lacet).
- Clic gauche ou Espace : tir. C : changer de caméra. Échap : pause.

**Téléphone**
- Joystick virtuel à gauche : manche (tangage/roulis).
- Curseur de gaz à droite, gros bouton de tir à droite.
- Pas de palonnier : virage coordonné automatique.

### 7.3 Aide à la visée (option C)
Un repère d'anticipation s'affiche devant l'ennemi **seulement à courte portée** (< 350 m), ou **en permanence en mode facile** (réglage). Pas d'aide au-delà en mode normal.

### 7.4 Structure de partie : vagues
1. Départ sur la piste, moteur au ralenti. Décollage manuel.
2. Vague 1 : 2 chasseurs peu agressifs.
3. Vague détruite → **pause de 30 s** affichée. Le joueur peut se poser pour recharger/réparer, ou rester en l'air (bonus de points « sans escale »).
4. Difficulté croissante : nombre d'ennemis, qualité de l'IA, puis avions plus rapides.
5. **Toutes les 5 vagues : bombardiers escortés** qui visent la piste. Piste détruite → impossible de s'y poser jusqu'à la fin de la vague suivante.
6. **Un seul avion** : fin de partie si abattu, écrasé (sol ou bâtiment) ou en panne sèche.
7. Écran de fin : vague atteinte, victoires, précision ; meilleur score sauvegardé dans le navigateur.

### 7.5 Ressources et dégâts
- **Carburant** : ~4 min à plein régime, consommation proportionnelle aux gaz.
- **Munitions** : ~20 s de tir continu.
- **Dégâts par zones**, chacun avec un effet de pilotage :
  - moteur → perte de puissance, fumée ;
  - aile gauche / droite → roulis parasite du côté touché ;
  - empennage → gouvernes moins réactives ;
  - réservoir → fuite de carburant.
  Destruction si les points de vie globaux tombent à 0 ou si une aile est détruite.
- **Atterrissage réussi** si : train sorti, aligné avec la piste, vitesse faible, vitesse verticale faible, ailes presque à plat. Hors tolérance → crash.
- **Au sol, immobile sur la zone de ravitaillement** : plein, munitions et réparation progressifs en ~5 s.

## 8. Laissé au constructeur (décisions prises par Claude, à corriger si besoin)

- **Stack** : Vite + TypeScript + three.js, aucun moteur physique. Tests de la logique (vol, balistique, dégâts, vagues) avec Vitest. Déploiement sur GitHub Pages.
- **Simulation** à pas fixe (60 Hz), rendu interpolé.
- **Modèle de vol** : vitesse, portance ∝ vitesse², décrochage sous une vitesse seuil (le nez tombe), traînée, gravité, taux de rotation limités et réduits à haute vitesse. Valeurs réglables dans un fichier de configuration unique.
- **Balles** : vitesse ~600 m/s (volontairement plus lente que le réel pour rendre l'anticipation lisible), légère chute, traçantes une balle sur quatre, portée ~800 m.
- **Carte** : ~4 × 4 km. Centre-ville en grille avec tours de 40 à 200 m et rues assez larges pour y passer en rase-mottes ; villages en périphérie ; aérodrome en bordure. Plafond 1 500 m. Limite de carte : avertissement puis demi-tour forcé.
- **Collisions** : boîtes englobantes pour les bâtiments (le style voxel rend les formes exactes), sphères pour les avions, rayon pour les balles. Les boîtes de collision correspondent exactement au visuel (pas de morts injustes).
- **IA** : états patrouille → poursuite → attaque (tir anticipé avec une erreur qui diminue selon la vague) → évasion ; évitement du sol et des bâtiments par anticipation de trajectoire. Les ennemis apparaissent au bord de la carte, loin du joueur.
- **Vagues** : chasseurs = min(1 + vague, 8) ; compétence IA = min(1, 0,2 + 0,08 × vague) ; bombardiers aux vagues 5, 10, 15… (vague / 5 bombardiers + escorte), avec mitrailleurs arrière.
- **Train d'atterrissage** : sorti/rentré automatiquement selon l'altitude et la vitesse près de la piste (évite un bouton de plus sur téléphone).
- **Caméra** : poursuite à la 3ᵉ personne, plus une caméra « regard vers la cible ».
- **Interface** : vitesse, altitude, gaz, carburant, munitions, état des dégâts (silhouette de l'avion colorée par zone), numéro de vague, flèches vers les ennemis hors écran, flèche vers la piste.
- **Sons** : synthétisés avec Web Audio (moteur dont la hauteur suit les gaz, mitrailleuse, impacts, explosions). Aucun fichier son à charger.
- **Avion du joueur et ennemis** : silhouettes génériques inspirées de la Seconde Guerre mondiale, sans marques réelles d'une nation.
- **Langue de l'interface** : français.
