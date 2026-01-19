A+ RULESET (uzamknout do dokumentu / komentářů)

1) Souřadnicové prostory
  •	Player
  •	pos.x,pos.y = screen/viewport (0..W, 0..H)
  •	důvod: input + clamp + “raketa je v okně”
  •	Enemies / Projectiles / Bombs / Powerups
  •	pos.x = screen/viewport X (0..W, rozšířeno o margin)
  •	pos.y = world Y
  •	důvod: turret může být mimo obraz, bomber nahoře může házet, powerup může “čekat” mimo okno

2) Kamera / WorldScroll
  •	world.scrollX = pouze background/parallax (zatím)
  •	world.scrollY = cameraY offset, který sleduje hráče (už máš)
  •	Render pravidlo:
  •	non-player: drawY = pos.y - world.scrollY
  •	player: drawY = pos.y

3) Spawn pravidlo
  •	Všechny patterny (originY, centerY) jsou v viewport-space (logické “kde na obrazovce to chci vidět”)
  •	Při vytvoření entity:
  •	worldY = patternY + scrollY
  •	Tím se zabrání “plavání s kamerou”.

4) Culling pravidlo (přesně jak chceš)
  •	X: kill mimo canvas (screen-space) → x < -margin nebo x > W+margin
  •	Y: kill mimo world band kolem kamery → y < camY - band nebo y > camY + H + band
  •	band je designový knob (turrets/bombers/powerups)

✅ Tvoje “minX/maxX canvas, minY/maxY světa” je v tomhle modelu správně.