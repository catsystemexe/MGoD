# High level architecture

## Co kde je (stručný přehled)

- `src/main.ts` je entrypoint: načte CSS, najde `<canvas id="game">`, vytvoří instanci `Game` a zavolá `start()`. Obsahuje i základní boot/error bannery.
- `src/Game.ts` je hlavní orchestrátor runtime: drží game state, inicializuje systémy, koordinuje update/render kroky a napojuje `Loop` hooky.
- `src/core/Loop.ts` obsahuje hlavní smyčku (fixed timestep + render + samostatný CA tick) a fallback z `requestAnimationFrame` na `setInterval` při throttlingu.
- `src/render/*` je render vrstva:
  - `Renderer.ts` převádí world data na vykreslení do canvasu (`drawCA`, `drawBullets`, `drawPlayer`, `drawSnake`, …).
  - `Camera.ts` řeší follow/interpolaci kamery.
  - `Skins.ts` drží vizuální stylizaci entit.
- `src/ca/CAWorld.ts` je simulace „world“ buněk (Game of Life + stabilní chunky a helpery pro spawn/injekci).
- `src/game/systems/*` jsou doménové systémy (enemy, projectile, weapons, snake, loot, particle, director).
- `src/input/Input.ts` je vstupní vrstva (keyboard/mouse/pointer) používaná v `Game`.
- `src/debug/*` (`Overlay`, `Perf`) je diagnostika/HUD metriky.
- `src/core/Config.ts` je centrální konfigurace konstant (world rozměry, tick rates, feature flagy).

## Klíčové odkazy: render a hlavní loop

- **Kde se renderuje:**
  - `Game.render(...)` (`src/Game.ts`) je hlavní render orchestrace.
  - `Renderer` metody v `src/render/Renderer.ts` provádějí konkrétní draw passy nad canvas contextem.
- **Kde je hlavní loop:**
  - `Loop.start(...)` v `src/core/Loop.ts` (fixed update + CA update + render callbacky).
  - Napojení loopu na hru je v `Game.start()` (`src/Game.ts`), kde se předávají hooky `fixedUpdate`, `caUpdate`, `render`.

## World vs Screen

- **World space**
  - Logické souřadnice simulace (CA mřížka, hráč, enemy, projektily).
  - Ve world space probíhá gameplay a fyzika (`fixedUpdate`, `caUpdate`).
- **Screen space**
  - Pixelové souřadnice canvasu.
  - Převod world → screen se děje v rendereru přes kameru a `cellSize`:
    - typicky `screenX = (worldX - cam.x) * cellSize + viewW / 2`
    - typicky `screenY = (worldY - cam.y) * cellSize + viewH / 2`

## Render pipeline (high-level)

1. `Loop` zavolá `Game.render(alpha, frameDtSec)`.
2. `Game` spočítá interpolované pozice (`alpha`) pro plynulý obraz mezi fixed tick kroky.
3. Kamera (`Camera.follow`) vrátí aktuální view anchor.
4. `Renderer` vykreslí vrstvy scény v pořadí (grid/chunky/CA/bullets/snake/player/aim).
5. Další systémy renderují přes 2D context (`enemies`, `loot`, `particles`).
6. `Overlay` doplní HUD a debug/perf informace.

Tím je oddělená simulace (deterministický fixed/CA update) od vizuálního frame renderu.
