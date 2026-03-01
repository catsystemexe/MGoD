# Render pipeline (exact)

## 1) Render order (EXACT)

Pořadí níže odpovídá **skutečným voláním** v `Game.render(...)`:

1. `this.perf.onFrameDelta(frameDtSec * 1000)`
2. `this.overlay.onRenderFrame(frameDtSec)`
3. `this.input.beginFrame()`
4. `this.renderer.clear()`
5. `const p = lerpV2(this.player.prev, this.player.cur, alpha)`
6. `const cam = this.camera.follow(this.camPrev, this.camCur, alpha)`
7. `(this.renderer as any).drawGrid?.(cam)`
8. `this.renderer.drawStableChunks(this.ca.getStableChunks(), cam)`
9. `this.renderer.drawCA(this.ca, cam)`
10. `this.renderer.drawBullets(this.projectiles.getBullets(), cam)`
11. `if (Config.ENABLE_PHASE2) this.renderer.drawSnake(this.snake.getAllSegments(), cam, this.facing)`
12. `const ctx = this.renderer.getContext()`
13. `const cellSize = (this.renderer as any).getCellSize?.() ?? 4`
14. `const dpr = window.devicePixelRatio || 1`
15. `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`
16. `this.enemies.render(ctx, cam, cellSize)`
17. `this.loot.render(ctx, cam, cellSize)`
18. `this.particles.render(this.renderer, cam)`
19. `this.renderer.drawPlayer(p, cam, this.facing)`
20. `this.renderer.drawAim(this.aim as any, cam)`
21. `const wStatus = this.weapons.getStatus()`
22. `const waveInfo = this.director.getHUDInfo()`
23. `this.overlay.draw(ctx, [...])`
24. `this.perf.onRender(t1 - t0)`

## 2) Coordinate spaces

- **World space**
  - Simulační souřadnice hry (CA buňky, hráč, bullets, snake segmenty, enemy).
  - Výpočty gameplay/fyziky běží v world souřadnicích.
- **View/Camera space**
  - Kamera (`cam`) je world anchor (střed pohledu), spočtený přes `Camera.follow(prev, cur, alpha)`.
  - V praxi se world pozice nejdřív odečtou o `cam.x/cam.y`.
- **Screen space**
  - Canvas souřadnice v CSS pixelech (před DPR transformací).
  - Vznikají po aplikaci scale (`cellSize`) a offsetu středu viewportu (`viewW/2`, `viewH/2`).
- **UI space**
  - 2D overlay/HUD text (`overlay.draw`) kreslený nad scénou do stejného contextu po world vrstvách.

## 3) Exact world->screen transform (z kódu)

### Základní převod (většina objektů)

```ts
sx = (worldX - cam.x) * cs + viewW / 2
sy = (worldY - cam.y) * cs + viewH / 2
```

Použití je explicitně v:
- `drawBullets` (`b.x/b.y`),
- `drawPlayer` (`p.x/p.y`),
- `drawSnake` (`segment.x/segment.y`).

### Pixel-aligned varianta (grid, CA, aim)

V některých passech je navíc `Math.floor(...)`:

```ts
sx = Math.floor((worldX - cam.x) * cs + viewW / 2)
sy = Math.floor((worldY - cam.y) * cs + viewH / 2)
```

Použití je explicitně v:
- `drawGrid`,
- `drawCA`,
- `drawStableChunks`,
- `drawAim`.

### Device Pixel Ratio (DPR)

Před kreslením passy nastavují transform:

```ts
dpr = window.devicePixelRatio || 1
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```

Canvas backing resolution je zároveň škálovaná podle DPR (`canvas.width = window.innerWidth * dpr`, `canvas.height = window.innerHeight * dpr`).

## 4) 5 foot-guns (co nejčastěji rozbije render)

1. **Rozbitý `ctx.setTransform(...)` pořádek**  
   Když některý pass zapomene nastavit/obnovit transform, mixnou se world/UI vrstvy v jiné škále.

2. **Nekonzistentní `cellSize` (`cs`) mezi systémy**  
   Pokud render pass používá jiné `cs` než zbytek, objekty „ujíždí“ proti mřížce/kolizím.

3. **Špatné center offsety (`viewW/2`, `viewH/2`)**  
   Chyba v offsetu okamžitě rozhodí kameru i aim/crosshair (objekty nejsou kolem středu view).

4. **DPR mismatch (CSS size vs backing size)**  
   Když se změní resize logika nebo se vynechá DPR scale, obraz je rozmazaný nebo posunutý.

5. **Nekonzistence `Math.floor` vs bez floor**  
   Smíchání subpixel a pixel-aligned kreslení na špatném místě vede ke shimmering/jitter artefaktům.

## 5) Smoke checks (rychlé kontroly po změně)

1. **Crosshair lock**: při stání hráče a myši na místě nesmí crosshair „plavat“ vůči gridu.  
2. **Camera follow**: při pohybu hráče zůstává hráč vizuálně ve středu view (bez driftu).  
3. **DPR check**: na HiDPI displeji je obraz ostrý (žádné rozmazané hrany UI/textu).  
4. **Layer order check**: HUD/overlay je vždy nad world objekty a není překrytý CA/gridem.  
5. **Phase2 toggle**: při `Config.ENABLE_PHASE2=false` snake pass mizí bez side-effectů na ostatní vrstvy.
