#!/usr/bin/env bun
/** CPU-only, private snapshot replay. No live-root mutation or network/model installation. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, cpus } from "node:os";
import { Database } from "bun:sqlite";
import { assertSnapshot, digest, manifest } from "./local-retrieval-snapshot.ts";
import { buildShadowDatabase, SqliteSearcher, collectProjectedUnits, logicalUnitDigest, canonicalUnitRecord, unitKey, applyKnownDelta, queryCases, compareQueries } from "./promptus-sqlite.ts";
import { collectEffectiveUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
import { buildSearchIndex, searchIndex, type SearchIndex } from "../promptus/scripts/lib/search.ts";
import { unitText } from "../promptus/scripts/lib/units.ts";

const REPO = resolve(import.meta.dir, ".."), SCRIPTS = join(REPO, "promptus/scripts");
const ENV = { ...process.env, CUDA_VISIBLE_DEVICES: "", HIP_VISIBLE_DEVICES: "", ROCR_VISIBLE_DEVICES: "", QMD_FORCE_CPU: "1", NODE_LLAMA_CPP_SKIP_DOWNLOAD: "true", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" };
const stamp = () => new Date().toISOString();
const summary = (samples: number[]) => { const s = [...samples].sort((a,b)=>a-b); return { n:s.length, medianMs:s[Math.floor(s.length/2)], p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)], samplesMs:samples }; };
function sourceIndex(root: string) {
  const units = collectProjectedUnits(root);
  const index = buildSearchIndex(units.map(u=>({...u,path:u.relPath})), "private-replay");
  return {units,index};
}
async function command(root: string, argv: string[], input = "", timeoutMs = 180_000) {
  const start = performance.now();
  const child = Bun.spawn(["/usr/bin/time", "-f", "__RESOURCE__ %U %S %M", ...argv], { cwd:root, env:ENV, stdin:new Blob([input]), stdout:"pipe", stderr:"pipe" });
  const timer = setTimeout(()=>child.kill(),timeoutMs);
  const [stdout,stderr,code] = await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]); clearTimeout(timer);
  const match = stderr.match(/__RESOURCE__ ([\d.]+) ([\d.]+) (\d+)/);
  return {ms:performance.now()-start,code,stdout,stderr,resource:match ? {userSeconds:+match[1],systemSeconds:+match[2],maxRssKiB:+match[3]}:null};
}
const publicCommand = (r:Awaited<ReturnType<typeof command>>) => ({ms:r.ms,code:r.code,resource:r.resource,stdoutHash:digest(r.stdout),stderrHash:digest(r.stderr)});
const requireSuccess = (r:Awaited<ReturnType<typeof command>>) => {if(r.code!==0) throw new Error(`subprocess failed; stderr hash ${digest(r.stderr)}`); return r;};

async function run(snapshot: string) {
  const capture = assertSnapshot(snapshot), work=mkdtempSync(join(tmpdir(),`organon-replay-${capture.label}-`));
  cpSync(join(snapshot,".promptus"),join(work,".promptus"),{recursive:true});
  writeFileSync(join(work,"replay-marker"),"organon.private-retrieval-replay.v1");
  const codeFiles=[import.meta.path,join(import.meta.dir,"local-retrieval-snapshot.ts"),join(import.meta.dir,"promptus-sqlite.ts"),join(SCRIPTS,"kb-add.ts"),join(SCRIPTS,"kb-amend.ts"),join(SCRIPTS,"kb-find.ts"),join(SCRIPTS,"kb-index.ts"),join(SCRIPTS,"lib/search.ts"),join(SCRIPTS,"lib/read-store.ts")];
  const hashes=Object.fromEntries(codeFiles.map(p=>[p,digest(readFileSync(p))]));
  const report:any={schema:"organon.private-retrieval-replay.v2",started:stamp(),label:capture.label,captureHash:capture.manifestHash,sourceFiles:capture.files,sourceBytes:capture.bytes,work,hashes,hardware:{cpu:cpus()[0]?.model,logicalCpus:cpus().length},cpuOnly:true,steps:[],limitations:["Private source-only native-temp snapshot; external artifacts and original Windows-mount timings excluded.","Query cases test exact behavioral equivalence and latency, not independently judged semantic relevance.","Known-delta preparation uses a full canonical scan; its cost is charged separately and included in total update cost. Full-index construction used solely as an independent oracle is outside that timing.","No production database integration, installation, or live-store mutation. Lexical retrieval downweights inactive evidence; it does not exclude it by default."]};
  const save=()=>writeFileSync(join(work,"report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
  const step=async(name:string,fn:()=>any)=>{const start=performance.now(); console.error(`${capture.label}: ${name}`); const result=await fn(); report.steps.push({name,ms:performance.now()-start,result});save();return result;};
  const script=(name:string,args:string[]=[],input="")=>command(work,[process.execPath,join(SCRIPTS,name),"--root",work,...args],input);
  try {
    await step("canonical-preflight",()=>{const units=collectEffectiveUnits(work,loadVocab(work)); report.units=units.length;return {units:units.length,cold:units.filter(u=>u.cold).length,ledger:units.filter(u=>u.substrate==="ledger").length};});
    await step("current-index",async()=>publicCommand(requireSuccess(await script("kb-index.ts",["--quiet"]))));
    const db=join(work,"shadow.sqlite");
    await step("sqlite-build",()=>buildShadowDatabase(work,db));
    let canonical=sourceIndex(work);
    const cases=queryCases(canonical.index), casePath=join(work,"queries.json");
    writeFileSync(casePath,JSON.stringify(cases),{mode:0o600}); report.querySuiteHash=digest(JSON.stringify(cases));
    await step("exact-query-equivalence",()=>{const result=compareQueries(work,canonical.index,canonical.units,db);if(!result.comparisons.every(x=>x.exact))throw new Error("query equivalence failed");return result;});
    await step("warm-query-suite",()=>{
      const sql=new SqliteSearcher(work,db), lexical:number[]=[],sqlite:number[]=[];
      try {for(let repeat=0;repeat<3;repeat++)for(const c of cases){let start=performance.now();searchIndex(canonical.index,c.query,c.options,d=>unitText(work,d.path,d.title));lexical.push(performance.now()-start);start=performance.now();sql.search(c.query,c.options);sqlite.push(performance.now()-start);}}
      finally {sql.close();}return {lexical:summary(lexical),sqlite:summary(sqlite)};
    });
    await step("fresh-process-query",async()=>{
      const rows=[];
      for(let i=0;i<3;i++)for(const backend of ["json","sqlite"]){const r=requireSuccess(await command(work,[process.execPath,import.meta.path,"query",work,backend,String(i)]));rows.push({backend,...publicCommand(r),result:JSON.parse(r.stdout)});}
      return rows;
    });
    await step("individual-write-read-loops",async()=>{
      const results=[];
      for(let i=0;i<3;i++){
        const token=`organoncpureplayprobe${["amber","cobalt","violet"][i]}`;
        const write=requireSuccess(await script("kb-add.ts",["--substrate","ledger","--kind","RESULT","--status","VALIDATED","--title",`Isolated CPU replay ${token}`,"--json"],`Synthetic benchmark probe only: ${token}. Not a scientific result about the copied project.\n`));
        const id=JSON.parse(write.stdout).id;
        const immediate=requireSuccess(await script("kb-find.ts",[token,"--limit","5"]));
        if(!immediate.stdout.includes(token))throw new Error("new write not immediately visible lexically");
        const prep=performance.now(), nextUnits=collectProjectedUnits(work), old=new Map(canonical.units.map(u=>[unitKey(u),JSON.stringify(canonicalUnitRecord(u))]));
        const changed=nextUnits.filter(u=>old.get(unitKey(u))!==JSON.stringify(canonicalUnitRecord(u))), preparationMs=performance.now()-prep;
        const next={units:nextUnits,index:undefined as unknown as SearchIndex};
        const deltaStart=performance.now(), delta=applyKnownDelta(db,work,changed,new Map(next.units.map((u,n)=>[unitKey(u),n]))), deltaWallMs=performance.now()-deltaStart;
        next.index=buildSearchIndex(next.units.map(u=>({...u,path:u.relPath})),"private-replay");
        const exactLogical=delta.logicalDigest===logicalUnitDigest(next.units);
        const suite=compareQueries(work,next.index,next.units,db);
        if(!exactLogical || !suite.comparisons.every(x=>x.exact))throw new Error("post-write SQLite identity/ranking drift");
        const sql=new SqliteSearcher(work,db); let found;try{found=sql.search(token,{}).some(h=>h.document.id===id);}finally{sql.close();}
        if(!found)throw new Error("SQLite missed newly written ID");
        const rebuilt=requireSuccess(await script("kb-index.ts",["--quiet"]));
        results.push({write:publicCommand(write),immediateRead:publicCommand(immediate),preparationMs,delta,deltaWallMs,fullIndex:publicCommand(rebuilt),exactLogical,exactQueries:true,newIdFound:found,deltaPipelineMs:write.ms+preparationMs+deltaWallMs});
        canonical=next;
      }return results;
    });
    await step("gated-amendment-and-restart",async()=>{
      const added=requireSuccess(await script("kb-add.ts",["--substrate","finding","--kind","CLAIM","--status","VALIDATED","--title","Isolated CPU lifecycle probe","--json"],"Synthetic lifecycle probe cpureplaylifecycleamber. No scientific claim.\n"));
      const {id,path}=JSON.parse(added.stdout);
      for(const status of ["VALIDATED","REFUTED"]){
        if(status==="REFUTED")requireSuccess(await script("kb-amend.ts",["--path",path,"--substrate","finding","--kind","CLAIM","--status",status]));
        const next=sourceIndex(work),previous=new Map(canonical.units.map(u=>[unitKey(u),JSON.stringify(canonicalUnitRecord(u))]));
        const changed=next.units.filter(u=>previous.get(unitKey(u))!==JSON.stringify(canonicalUnitRecord(u)));
        const delta=applyKnownDelta(db,work,changed,new Map(next.units.map((u,n)=>[unitKey(u),n])));
        if(delta.logicalDigest!==logicalUnitDigest(next.units))throw new Error("amendment digest drift");canonical=next;
      }
      const sql=new SqliteSearcher(work,db);try{if(sql.search("cpureplaylifecycleamber",{}).some(h=>h.document.id===id&&h.document.status!=="REFUTED")||sql.search("cpureplaylifecycleamber",{status:"VALIDATED"}).some(h=>h.document.id===id)||!sql.search("cpureplaylifecycleamber",{status:"REFUTED"}).some(h=>h.document.id===id))throw new Error("lifecycle filter failed");}finally{sql.close();}
      requireSuccess(await script("kb-index.ts",["--quiet"]));
      const current=requireSuccess(await script("kb-find.ts",["cpureplaylifecycleamber","--status","VALIDATED"])),history=requireSuccess(await script("kb-find.ts",["cpureplaylifecycleamber","--status","REFUTED"]));
      if(current.stdout.includes("Isolated CPU lifecycle probe")||!history.stdout.includes("Isolated CPU lifecycle probe"))throw new Error("restarted lifecycle mismatch");
      return {current:publicCommand(current),history:publicCommand(history),exactLogical:true};
    });
    await step("frozen-source-preserved",()=>({verified:assertSnapshot(snapshot).verified}));
    report.passed=true;
  } catch(error){report.passed=false;report.failure=String(error); console.error(`${capture.label}: ${report.failure}`);}
  report.changedCode=codeFiles.filter(p=>hashes[p]!==digest(readFileSync(p)));if(report.changedCode.length)report.passed=false;
  report.completed=stamp();save();console.log(JSON.stringify({work,report:join(work,"report.json"),passed:report.passed,units:report.units}));
  return report.passed?0:1;
}
if(import.meta.main){
  globalThis.fetch=(async()=>{throw new Error("offline benchmark");}) as typeof fetch;
  const [action,root,backend,n]=process.argv.slice(2);
  if(action==="run"&&root&&process.argv.length===4) process.exitCode=await run(root);
  else if(action==="query"&&root&&["json","sqlite"].includes(backend)&&/^\d+$/.test(n)){
    const physical=resolve(root);if(!physical.startsWith(tmpdir()+"/organon-replay-")||readFileSync(join(root,"replay-marker"),"utf8")!=="organon.private-retrieval-replay.v1")throw new Error("unmarked query fixture");
    const c=JSON.parse(readFileSync(join(root,"queries.json"),"utf8"))[+n],start=performance.now();let hits;
    if(backend==="sqlite"){const sql=new SqliteSearcher(root,join(root,"shadow.sqlite"));try{hits=sql.search(c.query,c.options);}finally{sql.close();}}
    else {const index=JSON.parse(readFileSync(join(root,".promptus/cache/search.json"),"utf8")) as SearchIndex;hits=searchIndex(index,c.query,c.options,d=>unitText(root,d.path,d.title));}
    console.log(JSON.stringify({openQueryMs:performance.now()-start,hits:hits.length,resultHash:digest(JSON.stringify(hits.map(h=>[h.document.key,h.score])))}));
  } else throw new Error("usage: local-retrieval-replay.ts run VERIFIED_SNAPSHOT");
}
