import { createGame } from "../game/boot/createGame";

function makeStubCanvas(): any {
  return { width:0,height:0,style:{},
    getBoundingClientRect:()=>({left:0,top:0,width:0,height:0,right:0,bottom:0,x:0,y:0,toJSON:()=>({})}),
    addEventListener(){}, removeEventListener(){},
  };
}
function ensureWindowStub(): void {
  const g: any = globalThis as any;
  if (!g.window) g.window = { addEventListener(){}, removeEventListener(){}, devicePixelRatio: 1 };
  if (!g.document) g.document = { addEventListener(){}, removeEventListener(){}, body: {} };
}
async function main(){
  ensureWindowStub();
  const { loop, store } = await createGame(()=>makeStubCanvas(), 400, 224);
  for (let i=0;i<300;i++) loop.stepOneTick(); // 5s
  let greens=0, enemies=0;
  (store as any).debugForEachAlive?.((_r:any,e:any)=>{
    if(e?.kind==="enemy"){ enemies++; if(e?.typeId==="green") greens++; }
  });
  console.log("[COUNT] enemies", enemies, "greens", greens);
}
main().catch(e=>{console.error(e);process.exit(1);});
