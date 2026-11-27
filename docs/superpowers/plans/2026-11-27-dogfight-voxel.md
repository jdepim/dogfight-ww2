# Dogfight WW2 voxel — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Un jeu web 3D voxel de dogfight Seconde Guerre mondiale, en vagues, jouable sur PC (clavier/souris) et téléphone (joystick virtuel).

**Architecture :** La logique de jeu (vol, balistique, dégâts, IA, vagues) est en TypeScript pur, sans dépendance au rendu, testée avec Vitest et simulée à pas fixe 60 Hz. three.js ne sert qu'à l'affichage : modèles voxel générés par code et fusionnés en un maillage par modèle. L'interface est une couche DOM au-dessus du canvas.

**Tech Stack :** Vite 6, TypeScript 5 (strict), three.js (dernière 0.x), Vitest, GitHub Actions → GitHub Pages. Aucun moteur physique.

**Spec :** `docs/superpowers/specs/2026-11-27-dogfight-voxel-design.md`

## Global Constraints

- Unités : mètres, secondes, radians. Repère three.js : Y vers le haut, l'avion avance selon −Z local.
- Toutes les valeurs réglables vivent dans `src/config.ts` (une seule source ; aucune constante magique ailleurs).
- Simulation à pas fixe `1/60` s ; rendu interpolé ; `dt` réel borné à 0,25 s.
- Budget : < 150 appels de rendu, ≥ 30 i/s sur téléphone milieu de gamme, bundle initial < 3 Mo, aucun fichier image ni son.
- Pas de textures : couleurs par sommet uniquement.
- Interface en français. Téléphone : paysage obligatoire (message sinon).
- Aucune marque nationale réelle sur les avions.
- `base` Vite = `/dogfight-ww2/` (GitHub Pages).

## Review Focus

1. **Onglet masqué puis réaffiché** → énorme `dt` : la simulation ne doit pas « sauter » (borne de 0,25 s, Task 1).
2. **Balles rapides qui traversent une cible entre deux pas** (600 m/s = 10 m par pas) → test par segment, pas par point (Task 6).
3. **Pointeur déverrouillé (Échap) ou fenêtre qui perd le focus** → pause automatique, pas un avion qui part en vrille (Task 7).
4. **Appareil hybride tactile + souris** → les deux couches d'entrée coexistent sans se contredire ; la dernière utilisée gagne (Task 7).
5. **Se poser hors piste, sur piste détruite ou trop vite** → crash net et expliqué à l'écran, jamais un état bloqué (Task 5 et Task 10).

---

## Structure des fichiers

```
src/
  config.ts                 toutes les valeurs réglables
  main.ts                   point d'entrée, branche tout
  core/loop.ts              boucle à pas fixe
  voxel/voxelGrid.ts        grille de voxels + maillage par faces visibles
  voxel/models.ts           avions (joueur, chasseur ennemi, bombardier), bâtiments
  flight/flightModel.ts     état et intégration du vol
  flight/damage.ts          dégâts par zones et effets sur le pilotage
  flight/resources.ts       carburant, munitions, ravitaillement
  combat/ballistics.ts      balles, touche par segment, point d'anticipation
  world/cityGen.ts          génération déterministe de la carte
  world/collision.ts        sphère/boîte, sol, limites
  world/airfield.ts         piste, atterrissage, zone de ravitaillement, train auto
  ai/enemyAI.ts             machine à états des ennemis
  game/waves.ts             composition des vagues
  game/game.ts              orchestrateur : phases, fin de partie, score
  game/score.ts             score + meilleur score (localStorage)
  input/types.ts            FlightInput
  input/desktopInput.ts     souris + clavier
  input/touchInput.ts       joystick virtuel, gaz, tir
  render/renderer.ts        scène, lumières, synchronisation entités → maillages
  render/camera.ts          caméra de poursuite / regard cible
  ui/hud.ts                 interface en jeu (DOM)
  ui/menus.ts               accueil, pause, fin, réglages, message d'orientation
  audio/sfx.ts              sons synthétisés Web Audio
tests/                      miroir de src/ (*.test.ts)
.github/workflows/deploy.yml
```

---

### Task 1 : Socle du projet et boucle à pas fixe

**Files :**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/config.ts`, `src/core/loop.ts`, `.github/workflows/deploy.yml`, `.gitignore`
- Test: `tests/core/loop.test.ts`

**Interfaces :**
- Produces: `CONFIG` (objet `as const` exporté par `src/config.ts`) ; `class FixedLoop { constructor(step: number, maxFrame: number, update: (dt: number) => void, render: (alpha: number) => void); advance(realDt: number): number /* nb de pas exécutés */ ; start(): void; stop(): void }`

- [ ] **Step 1 : Initialiser** Vite vanilla-ts, ajouter `three`, `@types/three`, `vitest`. Scripts : `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`). `vite.config.ts` : `base: '/dogfight-ww2/'`.
- [ ] **Step 2 : Créer `src/config.ts`** avec au minimum ces valeurs (les tâches suivantes en ajoutent) :

```ts
export const CONFIG = {
  sim: { step: 1 / 60, maxFrame: 0.25 },
  flight: { stallSpeed: 45, cruiseSpeed: 110, maxSpeed: 160, maxThrust: 18, dragCoef: 0.0007,
            pitchRate: 1.4, rollRate: 2.6, yawRate: 0.5, highSpeedRateFactor: 0.6, gravity: 9.81 },
  resources: { fuelSeconds: 240, ammo: 300, fireRate: 15, refuelSeconds: 5 },
  bullets: { speed: 600, range: 800, gravityFactor: 0.3, tracerEvery: 4 },
  aim: { leadIndicatorRange: 350 },
  waves: { pauseSeconds: 30, maxFighters: 8, bomberEvery: 5 },
  world: { size: 4000, ceiling: 1500, seed: 1944 },
} as const;
```

- [ ] **Step 3 : Écrire les tests** `tests/core/loop.test.ts` :
  - `advance(1/60)` → 1 pas ; `advance(0.05)` → 3 pas avec reste accumulé (`advance(0.05)` deux fois → 6 pas au total) ;
  - `advance(10)` → au plus `ceil(0.25 / step)` = 15 pas (Review Focus 1) ;
  - `render` reçoit `alpha` ∈ [0, 1[.
- [ ] **Step 4 :** `npm test` → échec (FixedLoop non défini).
- [ ] **Step 5 : Implémenter `FixedLoop`** (accumulateur ; `start` utilise `requestAnimationFrame` et appelle `advance`).
- [ ] **Step 6 :** `npm test` → PASS ; `npm run build` → OK.
- [ ] **Step 7 : `deploy.yml`** : sur push `main`, `npm ci && npm test && npm run build`, publication de `dist/` via `actions/deploy-pages`.
- [ ] **Step 8 : Commit** `feat: socle Vite + three + boucle à pas fixe`.

---

### Task 2 : Voxels et modèles

**Files :**
- Create: `src/voxel/voxelGrid.ts`, `src/voxel/models.ts`
- Test: `tests/voxel/voxelGrid.test.ts`, `tests/voxel/models.test.ts`

**Interfaces :**
- Produces:
  - `class VoxelGrid { constructor(sx: number, sy: number, sz: number); set(x,y,z, color: number): void; get(x,y,z): number /* 0 = vide */; fillBox(x0,y0,z0,x1,y1,z1,color): void; mirrorX(): void }`
  - `buildGeometry(grid: VoxelGrid, voxelSize: number): THREE.BufferGeometry` (attributs `position`, `normal`, `color` ; centrée sur l'origine)
  - `makePlayerFighter(): VoxelGrid`, `makeEnemyFighter(): VoxelGrid`, `makeBomber(): VoxelGrid`, `makeBuilding(w: number, h: number, d: number, style: 'tower'|'house', seed: number): VoxelGrid`
  - `const PROPELLER_ANCHOR: Record<'player'|'enemy'|'bomber', [number, number, number]>` (position de l'hélice, animée à part)

- [ ] **Step 1 : Tests du maillage** :
  - un voxel seul → 6 faces = 36 sommets (triangles non indexés) ou 24 sommets indexés ; choisir indexé et tester 24 sommets / 36 indices ;
  - deux voxels adjacents → la face commune n'est pas émise (10 faces) ;
  - grille vide → géométrie à 0 sommet sans erreur ;
  - `mirrorX` sur un voxel en x=0 d'une grille de largeur 5 → voxel aussi en x=4.
- [ ] **Step 2 :** `npm test` → échec.
- [ ] **Step 3 : Implémenter** `VoxelGrid` (tableau `Uint32Array`) et `buildGeometry` (émission des faces visibles uniquement ; la fusion gloutonne de faces n'est **pas** requise si le budget de la Task 12 est tenu).
- [ ] **Step 4 : Tests des modèles** : chasseur du joueur ≈ 30 voxels de long (axe Z, 28 à 32) ; symétrie gauche/droite ; bombardier plus long que le chasseur ; `makeBuilding(..., seed)` déterministe (même graine → même grille).
- [ ] **Step 5 : Implémenter les modèles** : silhouettes génériques d'inspiration Seconde Guerre mondiale (aile basse, nez moteur, verrière, empennage), deux palettes distinctes joueur/ennemi, cocardes en cercles de couleur sans marque nationale. Bâtiments : fenêtres peintes en alternance de couleurs, toit d'une autre teinte.
- [ ] **Step 6 :** `npm test` → PASS.
- [ ] **Step 7 : Commit** `feat: voxels, maillage et modèles`.

---

### Task 3 : Modèle de vol

**Files :**
- Create: `src/flight/flightModel.ts`, `src/input/types.ts`
- Test: `tests/flight/flightModel.test.ts`

**Interfaces :**
- Produces:
  - `interface FlightInput { pitch: number; roll: number; yaw: number; throttleDelta: number; fire: boolean }` (axes ∈ [−1, 1])
  - `interface FlightState { position: THREE.Vector3; velocity: THREE.Vector3; orientation: THREE.Quaternion; throttle: number /* 0..1 */; speed: number; onGround: boolean; stalled: boolean }`
  - `interface ControlModifiers { thrustFactor: number; controlFactor: number; rollBias: number }` (valeurs neutres : 1, 1, 0)
  - `createFlightState(position: THREE.Vector3, headingRad: number, onGround: boolean): FlightState`
  - `stepFlight(s: FlightState, input: FlightInput, mods: ControlModifiers, hasFuel: boolean, dt: number): void` (modifie `s`)

- [ ] **Step 1 : Tests** :
  - à vitesse de croisière, gaz 0,7, commandes au neutre, pendant 5 s → altitude stable à ±15 m ;
  - gaz 0 en vol → la vitesse diminue ;
  - vitesse < `stallSpeed` en vol → `stalled === true` et le nez descend (composante Y de l'avant décroît) ;
  - roulis plein pendant 1 s à croisière → angle ≈ `rollRate × highSpeedRateFactor-interpolé` (borne : ≤ `rollRate` rad) ;
  - `hasFuel = false` → aucune poussée ;
  - `rollBias = 0.3`, commandes neutres → l'avion part en roulis ;
  - au sol, gaz plein → accélère sur la piste et ne décolle qu'au-dessus de `stallSpeed` avec tangage tiré ;
  - vitesse plafonnée à `maxSpeed` en palier.
- [ ] **Step 2 :** `npm test` → échec.
- [ ] **Step 3 : Implémenter `stepFlight`** : poussée le long de l'avant ∝ `throttle × maxThrust × thrustFactor` ; traînée ∝ v² ; portance perpendiculaire aux ailes ∝ v² calibrée pour égaler la gravité à `cruiseSpeed` en palier ; taux de rotation × `controlFactor`, réduits linéairement jusqu'à `highSpeedRateFactor` à `maxSpeed` ; la vitesse s'aligne progressivement sur l'avant (comportement arcade) ; décrochage : portance réduite et couple piqueur. Au sol : pas de roulis, frottement, l'altitude reste à la hauteur de la piste.
- [ ] **Step 4 :** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: modèle de vol arcade`.

---

### Task 4 : Dégâts et ressources

**Files :**
- Create: `src/flight/damage.ts`, `src/flight/resources.ts`
- Test: `tests/flight/damage.test.ts`, `tests/flight/resources.test.ts`

**Interfaces :**
- Consumes: `ControlModifiers` (Task 3)
- Produces:
  - `type Zone = 'engine' | 'wingL' | 'wingR' | 'tail' | 'tank'`
  - `interface DamageState { zones: Record<Zone, number> /* 0..1, 1 = détruit */; hp: number /* 0..100 */ }`
  - `createDamage(): DamageState`, `applyHit(d: DamageState, zone: Zone, amount: number): void`, `isDestroyed(d): boolean`, `modifiersFrom(d): ControlModifiers`, `repair(d, fraction: number): void`
  - `zoneFromLocalHit(local: THREE.Vector3): Zone` (point d'impact en repère avion)
  - `interface Resources { fuel: number /* s */; ammo: number; fireCooldown: number }`
  - `createResources(): Resources`, `consume(r, throttle: number, d: DamageState, dt: number): void`, `tryFire(r, dt: number): boolean`, `refuel(r, d: DamageState, dt: number): void`

- [ ] **Step 1 : Tests dégâts** : moteur à 0,5 → `thrustFactor` < 1 ; aile gauche touchée → `rollBias` < 0 (droite → > 0) ; empennage → `controlFactor` < 1 ; `hp` à 0 → détruit ; aile à 1 → détruit ; `zoneFromLocalHit` : x < −2 → `wingL`, x > 2 → `wingR`, z < −3 (avant) → `engine`, z > 4 → `tail`, sinon `tank`.
- [ ] **Step 2 : Tests ressources** : 240 s à plein gaz vident le réservoir (±1 s) ; gaz 0,5 → consommation moitié ; réservoir touché à 1 → fuite supplémentaire ; `tryFire` en continu 1 s → 15 tirs ; munitions à 0 → `false` ; `refuel` pendant 5 s → plein, munitions pleines, dégâts réparés et `hp` = 100.
- [ ] **Step 3 :** `npm test` → échec.
- [ ] **Step 4 : Implémenter** les deux modules.
- [ ] **Step 5 :** `npm test` → PASS.
- [ ] **Step 6 : Commit** `feat: dégâts par zones et ressources`.

---

### Task 5 : Monde, collisions, aérodrome

**Files :**
- Create: `src/world/cityGen.ts`, `src/world/collision.ts`, `src/world/airfield.ts`
- Test: `tests/world/cityGen.test.ts`, `tests/world/collision.test.ts`, `tests/world/airfield.test.ts`

**Interfaces :**
- Produces:
  - `interface Building { min: THREE.Vector3; max: THREE.Vector3; style: 'tower'|'house'; seed: number }`
  - `interface WorldLayout { buildings: Building[]; runway: Runway; spawnRing: number }`
  - `interface Runway { center: THREE.Vector3; headingRad: number; length: number; width: number; refuelZone: { min: THREE.Vector3; max: THREE.Vector3 }; destroyedUntilWave: number }`
  - `generateWorld(seed: number): WorldLayout`
  - `class CollisionWorld { constructor(buildings: Building[]); sphereHits(p: THREE.Vector3, r: number): boolean; segmentHits(a: THREE.Vector3, b: THREE.Vector3): boolean }` (grille spatiale de 100 m)
  - `groundHeight(): 0` ; `outOfBounds(p, size): 'ok' | 'warn' | 'force'` (warn à 90 % de la demi-taille ou au-dessus de 95 % du plafond `world.ceiling`, force au-delà)
  - `type LandingResult = 'airborne' | 'landed' | 'crash'`
  - `checkTouchdown(s: FlightState, rw: Runway, currentWave: number): { result: LandingResult; reason?: string }`
  - `gearDown(s: FlightState, rw: Runway): boolean`, `inRefuelZone(s, rw): boolean`

- [ ] **Step 1 : Tests carte** : même graine → même carte ; aucun bâtiment sur la piste ni à < 150 m de son axe ; au moins 10 tours entre 40 et 200 m de haut au centre ; rues ≥ 30 m entre tours ; tout dans ± `world.size / 2`.
- [ ] **Step 2 : Tests collisions** : sphère dans une boîte → vrai ; frôlement à r + 0,1 m → faux ; segment traversant une boîte fine sans extrémité dedans → vrai.
- [ ] **Step 3 : Tests atterrissage** (valeurs de la spec) : sur la piste, vitesse 50, vitesse verticale −2, roulis 5°, cap aligné à 10° → `landed` ; vitesse 70 → `crash` « trop rapide » ; vitesse verticale −6 → `crash` « trop brutal » ; roulis 20° → `crash` « ailes pas à plat » ; hors piste → `crash` « hors piste » ; piste avec `destroyedUntilWave >= currentWave` → `crash` « piste détruite ». Seuils dans `CONFIG.landing = { maxSpeed: 60, maxSink: 4, maxRollDeg: 10, maxHeadingDeg: 15 }`. `gearDown` vrai si altitude < 60 m, vitesse < 75 et à < 1 500 m de la piste.
- [ ] **Step 4 :** `npm test` → échec.
- [ ] **Step 5 : Implémenter** les trois modules (grille de blocs au centre, villages en couronne, piste en bordure ouest).
- [ ] **Step 6 :** `npm test` → PASS.
- [ ] **Step 7 : Commit** `feat: génération de la ville, collisions, aérodrome`.

---

### Task 6 : Balistique et anticipation

**Files :**
- Create: `src/combat/ballistics.ts`
- Test: `tests/combat/ballistics.test.ts`

**Interfaces :**
- Consumes: `CollisionWorld.segmentHits` (Task 5)
- Produces:
  - `interface Bullet { pos: THREE.Vector3; vel: THREE.Vector3; travelled: number; ownerId: number; tracer: boolean; alive: boolean }`
  - `class BulletPool { spawn(from: THREE.Vector3, dir: THREE.Vector3, inheritVel: THREE.Vector3, ownerId: number): void; step(dt: number, world: CollisionWorld, targets: HitTarget[], onHit: (b: Bullet, t: HitTarget, point: THREE.Vector3) => void): void; readonly bullets: Bullet[] }` (taille fixe 512, recyclage)
  - `interface HitTarget { id: number; position: THREE.Vector3; radius: number }`
  - `leadPoint(shooter: THREE.Vector3, shooterVel: THREE.Vector3, target: THREE.Vector3, targetVel: THREE.Vector3, bulletSpeed: number): THREE.Vector3 | null`

- [ ] **Step 1 : Tests** :
  - `leadPoint` : cible fixe → la cible elle-même ; cible traversant à 100 m/s à 600 m → le point est en avant de la cible, et une balle tirée vers ce point la rencontre à < 1 m (simulation) ; cible plus rapide que la balle, qui s'éloigne → `null` ;
  - une balle franchit 10 m par pas et une cible de rayon 3 m placée entre deux positions est touchée (Review Focus 2) ;
  - une balle ne touche jamais son propre tireur ;
  - au-delà de 800 m parcourus → `alive = false` ; un mur traversé → détruite, pas de touche derrière ;
  - une balle sur 4 a `tracer = true`.
- [ ] **Step 2 :** `npm test` → échec.
- [ ] **Step 3 : Implémenter** (vitesse héritée du tireur + 600 m/s ; chute `gravity × gravityFactor` ; touche = distance segment–centre < rayon ; `leadPoint` par la résolution quadratique classique de l'interception).
- [ ] **Step 4 :** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: balistique et point d'anticipation`.

---

### Task 7 : Commandes PC et téléphone

**Files :**
- Create: `src/input/desktopInput.ts`, `src/input/touchInput.ts`, `src/input/inputManager.ts`
- Test: `tests/input/mapping.test.ts`

**Interfaces :**
- Consumes: `FlightInput` (Task 3)
- Produces:
  - `mapMouse(dx: number, dy: number, sensitivity: number): { pitch: number; roll: number }` (pur, borné à ±1, recentrage progressif)
  - `mapJoystick(offsetX: number, offsetY: number, radius: number, deadZone: number): { pitch: number; roll: number }` (pur)
  - `class InputManager { constructor(canvas: HTMLCanvasElement, overlay: HTMLElement); read(): FlightInput; readonly lastDevice: 'desktop'|'touch'; onPauseRequest: () => void; setTouchUiVisible(v: boolean): void; dispose(): void }`
  - Touches : souris = manche (verrouillage du pointeur au clic), W/S gaz, A/D palonnier, clic gauche ou Espace = tir, C caméra, Échap pause. Tactile : joystick à gauche (zone morte 12 %), curseur de gaz vertical à droite, bouton tir à droite ; pas de palonnier.

- [ ] **Step 1 : Tests des fonctions pures** : joystick dans la zone morte → 0 ; au bord → ±1 ; au-delà du rayon → borné à 1 ; souris : grand déplacement borné à 1 ; vers le haut (dy < 0) → tangage piqueur selon le réglage « inverser » (`CONFIG.input.invertY = false` par défaut : souris vers soi = cabrer).
- [ ] **Step 2 :** `npm test` → échec.
- [ ] **Step 3 : Implémenter** les fonctions pures et `InputManager`. Déverrouillage du pointeur, `blur` ou `visibilitychange` (masqué) → `onPauseRequest` (Review Focus 3). Le dernier appareil utilisé gagne ; la couche tactile s'affiche au premier `touchstart` et se masque au premier mouvement de souris (Review Focus 4).
- [ ] **Step 4 :** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: commandes clavier/souris et tactiles`.

---

### Task 8 : Rendu et premier vol jouable

**Files :**
- Create: `src/render/renderer.ts`, `src/render/camera.ts`
- Modify: `src/main.ts`
- Test: `tests/render/camera.test.ts` ; vérification visuelle par Playwright

**Interfaces :**
- Consumes: Tasks 1 à 7
- Produces:
  - `class GameRenderer { constructor(canvas: HTMLCanvasElement, layout: WorldLayout); addPlane(id: number, kind: 'player'|'enemy'|'bomber'): void; removePlane(id: number): void; syncPlane(id: number, pos, quat, alpha: number): void; setBullets(b: readonly Bullet[]): void; spawnExplosion(p: THREE.Vector3): void; spawnSmoke(id: number, intensity: number): void; render(camera: THREE.Camera): void; readonly drawCalls: number }`
  - `chaseCamera(cam: THREE.PerspectiveCamera, target: FlightState, dt: number, mode: 'chase'|'target', lookAt?: THREE.Vector3): void` (amortie, placée derrière et au-dessus de l'avion)

- [ ] **Step 1 : Test caméra** : après 2 s de convergence derrière un avion immobile cap nord, la caméra est derrière (Z local positif), au-dessus, et regarde l'avion.
- [ ] **Step 2 :** `npm test` → échec, implémenter `chaseCamera`, → PASS.
- [ ] **Step 3 : Implémenter `GameRenderer`** : bâtiments fusionnés par blocs de quartier (un maillage par bloc de 500 m), sol en plan coloré, piste, ciel en dégradé, brouillard à 1 800 m ; balles en `InstancedMesh` ; explosions et fumée en petits cubes instanciés.
- [ ] **Step 4 : Brancher `main.ts`** : joueur seul sur la piste, vol libre, crash si collision ou sol → réapparition sur la piste.
- [ ] **Step 5 : Vérifier** : `npm run dev`, script Playwright qui charge la page, maintient les gaz 6 s puis tire le manche, et prend une capture. Attendu : avion en vol au-dessus de la ville, aucune erreur console, `drawCalls < 150`.
- [ ] **Step 6 : Commit** `feat: rendu voxel et premier vol jouable`.

---

### Task 9 : IA ennemie

**Files :**
- Create: `src/ai/enemyAI.ts`
- Test: `tests/ai/enemyAI.test.ts`

**Interfaces :**
- Consumes: `FlightState`, `FlightInput`, `stepFlight`, `leadPoint`, `CollisionWorld`
- Produces:
  - `type AIState = 'patrol' | 'pursue' | 'attack' | 'evade' | 'bombRun'`
  - `interface Enemy { id: number; kind: 'fighter'|'bomber'; flight: FlightState; damage: DamageState; resources: Resources; ai: { state: AIState; skill: number /* 0..1 */; timer: number } }`
  - `thinkEnemy(e: Enemy, player: FlightState, world: CollisionWorld, runway: Runway, rng: () => number): FlightInput` (pur hormis `e.ai`)

- [ ] **Step 1 : Tests** :
  - joueur à 1 000 m → `pursue`, et la commande tourne l'avion vers le joueur ;
  - joueur à < 400 m devant → `attack` ; `fire` vrai seulement si l'écart angulaire au point d'anticipation est < `0.03 + 0.12 × (1 − skill)` rad ;
  - joueur dans les six heures à < 300 m → `evade` ;
  - altitude < 80 m ou bâtiment à < 2 s de trajectoire → la commande cabre, quel que soit l'état ;
  - un bombardier reste en `bombRun` vers la piste et ne poursuit pas ; ses mitrailleurs arrière tirent (`fire` vrai) si le joueur est à < 300 m dans son demi-espace arrière ;
  - avec la même graine, mêmes décisions.
- [ ] **Step 2 :** `npm test` → échec.
- [ ] **Step 3 : Implémenter** (pilotage par erreur de cap/tangage vers un point visé, le roulis d'abord ; l'erreur de visée et le délai de réaction diminuent avec `skill`).
- [ ] **Step 4 :** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: IA des chasseurs et bombardiers`.

---

### Task 10 : Vagues, partie, score

**Files :**
- Create: `src/game/waves.ts`, `src/game/game.ts`, `src/game/score.ts`
- Modify: `src/main.ts`
- Test: `tests/game/waves.test.ts`, `tests/game/game.test.ts`, `tests/game/score.test.ts`

**Interfaces :**
- Consumes: Tasks 3 à 9
- Produces:
  - `waveComposition(n: number): { fighters: number; bombers: number; escorts: number; skill: number }` — chasseurs = `min(1 + n, 8)` ; compétence = `min(1, 0.2 + 0.08 n)` ; aux vagues multiples de 5 : bombardiers = `n / 5`, escortes = 2.
  - `type Phase = 'menu' | 'preflight' | 'wave' | 'break' | 'paused' | 'gameover'`
  - `class Game { constructor(layout: WorldLayout, rng: () => number); readonly phase: Phase; readonly wave: number; readonly breakTimeLeft: number; readonly player: { flight: FlightState; damage: DamageState; resources: Resources }; readonly enemies: Enemy[]; readonly bullets: BulletPool; readonly score: ScoreState; readonly lastDeathReason?: string; start(): void; step(input: FlightInput, dt: number): void; pause(): void; resume(): void; events: GameEvent[] /* vidé à chaque pas, lu par le rendu, l'interface et les sons */ }`
  - `type GameEvent = { type: 'hit'|'kill'|'explosion'|'landed'|'crash'|'waveStart'|'waveCleared'|'runwayDestroyed'|'fire'; position?: THREE.Vector3; id?: number }`
  - `interface ScoreState { kills: number; shots: number; hits: number; points: number; nonStopWaves: number }` ; `loadBest(): number`, `saveBest(points: number): boolean` (vrai si record ; tolère un `localStorage` indisponible)

- [ ] **Step 1 : Tests vagues** : vague 1 → 2 chasseurs, compétence 0,28 ; vague 10 → 8 chasseurs (plafond), 2 bombardiers + 2 escortes ; vague 4 → 0 bombardier.
- [ ] **Step 2 : Tests partie** :
  - `start` → `preflight` (au sol) ; décollage → `wave` 1 ;
  - tous les ennemis détruits → `break` de 30 s puis `wave` 2 ; les ennemis apparaissent à > 1 500 m du joueur ;
  - posé immobile dans la zone de ravitaillement pendant `break` → ressources et réparations au bout de 5 s ;
  - enchaîner la vague suivante sans s'être posé → `nonStopWaves + 1` et bonus ;
  - un bombardier qui atteint la piste → `runwayDestroyed`, `destroyedUntilWave = wave + 1` ;
  - abattu, collision ou panne sèche en vol → `gameover` avec `lastDeathReason` en français (« Abattu », « Collision avec un immeuble », « Écrasé au sol », « Panne sèche », plus les raisons d'atterrissage de la Task 5) ;
  - `outOfBounds` = `force` → l'entrée du joueur est remplacée par un virage vers le centre jusqu'au retour en zone `ok` ;
  - points : victoire = 100 × vague ; bonus sans escale = 250 × vague.
- [ ] **Step 3 : Tests score** : record enregistré puis relu ; `localStorage` qui lève une exception → pas de plantage, record = 0.
- [ ] **Step 4 :** `npm test` → échec.
- [ ] **Step 5 : Implémenter** les trois modules et brancher `Game` dans `main.ts` (remplace la boucle de vol libre de la Task 8).
- [ ] **Step 6 :** `npm test` → PASS.
- [ ] **Step 7 : Commit** `feat: vagues, déroulé de partie et score`.

---

### Task 11 : Interface et menus

**Files :**
- Create: `src/ui/hud.ts`, `src/ui/menus.ts`, `src/ui/style.css`
- Modify: `src/main.ts`, `index.html`
- Test: `tests/ui/hud.test.ts` (environnement `happy-dom`) ; vérification Playwright

**Interfaces :**
- Consumes: `Game`, `leadPoint`, `CONFIG.aim`
- Produces:
  - `class Hud { constructor(root: HTMLElement); update(game: Game, camera: THREE.Camera, easyMode: boolean): void }`
  - `projectToScreen(p: THREE.Vector3, cam: THREE.Camera, w: number, h: number): { x: number; y: number; onScreen: boolean }`
  - `shouldShowLead(distance: number, easyMode: boolean): boolean` → vrai si `easyMode` ou distance < 350
  - `class Menus { constructor(root: HTMLElement, onStart: () => void, onResume: () => void, onSettings: (s: Settings) => void); show(phase: Phase, game: Game): void }` ; `interface Settings { easyMode: boolean; invertY: boolean; sensitivity: number; volume: number }` (sauvegardé dans `localStorage`)

- [ ] **Step 1 : Tests** : `shouldShowLead(300, false)` → vrai ; `(400, false)` → faux ; `(2000, true)` → vrai ; `projectToScreen` d'un point derrière la caméra → `onScreen = false`.
- [ ] **Step 2 :** `npm test` → échec, implémenter, → PASS.
- [ ] **Step 3 : Interface en jeu** : vitesse, altitude, jauge de gaz, carburant, munitions, silhouette de l'avion colorée par zone (vert → orange → rouge), numéro de vague, compte à rebours de pause, repère d'anticipation, flèches vers les ennemis hors écran, flèche vers la piste (pulsante si carburant < 25 % ou munitions < 20 %), messages « Train sorti », « Décrochage ! », « Limite de zone ». Rester sobre (anti-objectif « écran surchargé »).
- [ ] **Step 4 : Menus** : accueil (Jouer, Réglages, meilleur score, aide aux commandes adaptée à l'appareil), pause, fin de partie (raison, vague, victoires, précision, record), réglages (mode facile, inverser l'axe vertical, sensibilité, volume), message « Tourne ton téléphone » en portrait.
- [ ] **Step 5 : Vérifier** par Playwright, une capture de bureau et une capture en émulation « iPhone 13 » paysage : interface lisible, boutons tactiles visibles sur téléphone seulement, aucun chevauchement.
- [ ] **Step 6 : Commit** `feat: interface en jeu et menus`.

---

### Task 12 : Sons, performance, mise en ligne

**Files :**
- Create: `src/audio/sfx.ts`, `README.md` (remplacement)
- Modify: `src/main.ts`
- Test: vérification Playwright de performance

**Interfaces :**
- Consumes: `Game.events`, `Settings.volume`
- Produces: `class Sfx { constructor(); unlock(): void /* au premier geste */; setEngine(throttle: number, damaged: boolean): void; play(e: GameEvent['type']): void; setVolume(v: number): void }`

- [ ] **Step 1 : Sons Web Audio** : moteur (oscillateur en dents de scie + bruit filtré, hauteur ∝ gaz, crachotements si moteur endommagé), rafale de mitrailleuse (bruit court), impact, explosion (bruit grave décroissant), alarme de carburant bas. Démarrage au premier geste (contrainte des navigateurs).
- [ ] **Step 2 : Mesurer** par Playwright en vague 10 simulée (8 chasseurs, 2 bombardiers, 2 escortes) : `drawCalls < 150`, moyenne d'images en émulation de processeur ralenti ×4 ≥ 30 i/s. Sinon : fusion gloutonne des faces dans `buildGeometry`, réduction de la distance du brouillard.
- [ ] **Step 3 : README** : présentation, lien du jeu en ligne, commandes PC et téléphone, `npm install`, `npm run dev`, `npm test`.
- [ ] **Step 4 : Vérifier** : `npm test` et `npm run build` → OK ; bundle < 3 Mo.
- [ ] **Step 5 : Commit et push** `feat: sons, optimisation et mise en ligne` ; vérifier que le workflow publie la page (activer Pages sur la source « GitHub Actions » dans les réglages du dépôt, action à faire par le propriétaire).
