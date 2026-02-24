

Mesh Terrain Background (meshTerrain)

Procedurální line-mesh background renderer s perspektivní projekcí, near/far depth shaping a stabilním scrolling modelem.

Tento renderer je navržen jako:
  •	stabilní základ pro další vizuální presety
  •	experimentální playground pro parametrické terrain modely
  •	kompatibilní základ pro paralelní návrhy dalších variant

⸻

🧱 Architektura

Vytvoření rendereru

Renderer je vytvářen přes:

BgPipeline → createRenderer("meshTerrain") → new MeshTerrainRenderer()

Každý renderer:
  1.	Sestaví Vertex + Fragment shader string
  2.	Compile + link program
  3.	Uloží uniform locations
  4.	Vytvoří VAO/VBO
  5.	Vygeneruje grid geometrii

⸻

🌍 Prostorový model

Renderer pracuje se třemi oddělenými prostory:

1. WORLD SPACE

Používá se pro sampling vln a deformací.

worldX = localX + uChunkOffset
worldZ = localZ + uChunkOffsetZ

  •	Stabilní
  •	ScrollX mění sampling
  •	ScrollY sampling neovlivňuje

⸻

2. VIEW SPACE

Používá se pro kameru.

viewX = worldX - cameraX
camMoveY = (uScroll.y - center) * SCROLL_Y_TO_VIEW

Scroll model:
  •	ScrollX → posun kamery po X
  •	ScrollY → skutečný camera-Y posun ve VIEW prostoru

ScrollY nikdy nesmí ovlivňovat Z.

⸻

3. PROJECTION SPACE

Perspektiva:

denom = 0.80 + zProj * uPersp
px = viewX / denom
py = (y + yTilt - camMoveY) / denom

Vlastnosti:
  •	Near se pohybuje víc než Far
  •	Žádný zoom efekt
  •	Žádné ohýbání horizontu

⸻

📐 Geometrie

Atribut:

layout(location=0) in vec2 aXZ;

  •	aXZ.x ∈ [-1..1]
  •	aXZ.y ∈ [0..1]

Grid je line-based:
  •	vertikální linie
  •	horizontální linie

Žádné fill triangly.
Žádný depth buffer.
Wireframe only.

⸻

🌊 Height Model

Výška terénu je složena z několika vrstev:

1. Wave Layers

Dvě sinusové vrstvy s nezávislými parametry:
  •	amp
  •	freq
  •	speed

2. Domain Warp

Používá se pro rozbití pravidelných sinusových pásů.

3. FBM Bumps

Detailní mikrodeformace:
  •	bumpAmp
  •	bumpFreq
  •	bumpSharp
  •	bumpOctaves
  •	bumpRot

⸻

🎚 Depth Shaping

Near/Far logika:

nearW = 1.0 - zBase
farW  = zBase

Používá se pro:
  •	amplitude shaping
  •	bump shaping
  •	far lift
  •	near drop

⸻

🎛 Dev UI Parametry

Wave
  •	amp
  •	freq
  •	speed
  •	amp2
  •	freq2
  •	speed2

Warp
  •	warpAmp
  •	warpFreq
  •	warpSpeed

Depth shaping
  •	ampDepthNear
  •	ampDepthFar
  •	ampDepthBias
  •	ampDepthPow
  •	bumpDepthNear
  •	bumpDepthFar
  •	bumpDepthBias
  •	bumpDepthPow

Bump detail
  •	bumpAmp
  •	bumpFreq
  •	bumpSpeed
  •	bumpSharp
  •	bumpOctaves
  •	bumpRot

Projection
  •	tilt
  •	persp
  •	xSpan
  •	nearDrop
  •	yShift

Render
  •	lineAlpha
  •	gridX
  •	gridZ

⸻

🧭 Scroll Logika (Důležité)

ScrollX
  •	Ovlivňuje WORLD sampling
  •	Lineární pohyb

ScrollY
  •	Ovlivňuje pouze VIEW space (camMoveY)
  •	Neovlivňuje Z
  •	Nechunkuje
  •	Nezpůsobuje zoom

⸻

⚠️ Known Pitfalls
  1.	ScrollY → Z sampling způsobuje zoom artefakty.
  2.	Chunk snapping podle scrollY způsobuje „zamrznutí“.
  3.	Uniform locations jsou platné jen pro konkrétní WebGLProgram.
  4.	denom nesmí záviset na scrollY.

⸻

🧩 Extension Points

Architekt může bezpečně měnit:
  •	z distribution curve
  •	depth remap model
  •	warp model
  •	crest shaping
  •	projekční model
  •	barevnou vrstvu / fog layer
  •	další post FX layer

Bez porušení core scroll architektury.

⸻

✅ Aktuální stav
  •	Stabilní scroll model
  •	Bez zoom artefaktů
  •	Oddělené prostory (World / View / Projection)
  •	Připraveno pro paralelní vývoj dalších presetů

⸻

🚀 Další možné kroky
  •	Přidat fog layer
  •	Přidat color gradient layer
  •	Přidat další mesh preset
  •	Přidat dokumentovaný preset systém
  •	Přidat gameplay entity integration

⸻