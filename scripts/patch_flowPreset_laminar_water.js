/* eslint-disable */
const fs = require("fs");

function die(msg) {
  console.error("PATCH FAIL:", msg);
  process.exit(1);
}

const FP = "src/render/webgl/bg/flowPresets.ts";
if (!fs.existsSync(FP)) die("missing file: " + FP);

let s = fs.readFileSync(FP, "utf8");

// najdi blok preset-u podle id a skonči na první "    }," (konec objektu preset v array)
const id = 'id: "flow.laminar.segments.v1"';
const i0 = s.indexOf(id);
if (i0 < 0) die("laminar preset id not found");

const start = s.lastIndexOf("{", i0);
if (start < 0) die("could not find preset '{' start");

const end = s.indexOf("\n    },", i0);
if (end < 0) die("could not find preset end '\\n    },' after id");

const block = s.slice(start, end + "\n    },".length);

// 1) yMeander tune (výraznější proudění + delší vlny v X)
const yMeanderRe = /yMeander:\s*\{\s*enabled:\s*true,\s*ampPx:\s*\{\s*min:\s*([0-9.]+),\s*max:\s*([0-9.]+)\s*\}[^}]*?freqHz:\s*\{\s*min:\s*([0-9.]+),\s*max:\s*([0-9.]+)\s*\}[^}]*?xPhaseCoupling:\s*([0-9.]+),\s*\}/s;

if (!yMeanderRe.test(block)) die("yMeander block not found inside laminar preset");

let newBlock = block.replace(yMeanderRe, (m) => {
  // čistě přepíšeme hodnoty (ponecháme formát bloku okolo)
  // cíle:
  // - amp: viditelná “voda”
  // - freq: živější, ale ne “vibro”
  // - coupling: delší proudy přes X
  return m
    .replace(/ampPx:\s*\{\s*min:\s*[0-9.]+,\s*max:\s*[0-9.]+\s*\}/, 'ampPx: { min: 2.2, max: 7.5 }')
    .replace(/freqHz:\s*\{\s*min:\s*[0-9.]+,\s*max:\s*[0-9.]+\s*\}/, 'freqHz: { min: 0.06, max: 0.16 }')
    .replace(/xPhaseCoupling:\s*[0-9.]+,/, 'xPhaseCoupling: 0.018,');
});

// 2) ribbon tune (atraktivnější dense “bands”, jemnější sampling)
// - víc lanes = víc “water mass”
// - menší stepPx = hladší křivky
// - mírně silnější near = čitelná parallax vrstva
const ribbonRe = /ribbon:\s*\{\s*lanes:\s*([0-9]+),\s*stepPx:\s*([0-9]+),\s*thicknessMul:\s*\{\s*far:\s*([0-9.]+),\s*mid:\s*([0-9.]+),\s*near:\s*([0-9.]+)\s*\},\s*\}/s;

if (!ribbonRe.test(newBlock)) die("ribbon block not found inside laminar preset");

newBlock = newBlock.replace(ribbonRe, (m) => {
  return m
    .replace(/lanes:\s*[0-9]+,/, "lanes: 240,")
    .replace(/stepPx:\s*[0-9]+,/, "stepPx: 4,")
    .replace(/thicknessMul:\s*\{\s*far:\s*[0-9.]+,\s*mid:\s*[0-9.]+,\s*near:\s*[0-9.]+\s*\}/,
      "thicknessMul: { far: 0.55, mid: 0.80, near: 1.15 }"
    );
});

// zapiš zpět
s = s.slice(0, start) + newBlock + s.slice(end + "\n    },".length);
fs.writeFileSync(FP, s, "utf8");

console.log("patched:", FP);
