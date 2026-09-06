#!/usr/bin/env bun
/** Existing local semantic stacks on verified private source snapshots. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, realpathSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertSnapshot, digest } from "./local-retrieval-snapshot.ts";
import { openEngine, type WorkloadEngine } from "./engine-workload-adapters.ts";
import { semanticSnapshot, semanticBase } from "../promptus/scripts/lib/semantic.ts";

const REPO=resolve(import.meta.dir,".."),SCRIPTS=join(REPO,"promptus/scripts"),SELF=import.meta.path;
const ENV={...process.env,CUDA_VISIBLE_DEVICES:"",HIP_VISIBLE_DEVICES:"",ROCR_VISIBLE_DEVICES:"",QMD_FORCE_CPU:"1",NODE_LLAMA_CPP_SKIP_DOWNLOAD:"true",HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1"};
async function cmd(root:string,argv:string[],input="",timeout=1_260_000){
 const start=performance.now(),p=Bun.spawn(["/usr/bin/time","-f","__RESOURCE__ %U %S %M",...argv],{cwd:root,env:ENV,stdin:new Blob([input]),stdout:"pipe",stderr:"pipe"});
 const timer=setTimeout(()=>p.kill(),timeout);const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);clearTimeout(timer);
 const logs=join(root,"process-logs");mkdirSync(logs,{recursive:true});const log=mkdtempSync(join(logs,"call-"));writeFileSync(join(log,"stdout"),stdout,{mode:0o600});writeFileSync(join(log,"stderr"),stderr,{mode:0o600});
 const m=stderr.match(/__RESOURCE__ ([\d.]+) ([\d.]+) (\d+)/);return {ms:performance.now()-start,stdout,stderr,code,log,resource:m?{userSeconds:+m[1],systemSeconds:+m[2],maxRssKiB:+m[3]}:null};
}
const safe=(r:any)=>({ms:r.ms,code:r.code,resource:r.resource,log:r.log,stdoutHash:digest(r.stdout),stderrHash:digest(r.stderr)});
const ok=(r:any)=>{if(r.code)throw new Error(`child failed: ${digest(r.stderr)}; private logs: ${r.log}`);return r;};
function dependencies(path:string){const root=realpathSync(path);if(!root.startsWith(realpathSync(tmpdir())+"/")||JSON.parse(readFileSync(join(root,"package.json"),"utf8")).name!=="organon-overhaul-engine-trial")throw new Error("unmarked dependencies");return root;}
function assertWork(root:string){if(!realpathSync(root).startsWith(realpathSync(tmpdir())+"/organon-semantic-private-")||readFileSync(join(root,"marker"),"utf8")!=="organon.private-semantic-replay.v1")throw new Error("unmarked semantic replay");}
async function main(snapshot:string,depsInput:string,engine:string){
 const capture=assertSnapshot(snapshot),deps=dependencies(depsInput);
 if(!["qmd","zvec"].includes(engine))throw new Error("expected qmd or zvec");
 const root=mkdtempSync(join(tmpdir(),`organon-semantic-private-${capture.label}-${engine}-`));cpSync(join(snapshot,".promptus"),join(root,".promptus"),{recursive:true});writeFileSync(join(root,"marker"),"organon.private-semantic-replay.v1");
 const model=join(deps,"model-cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf");
 const hashes=Object.fromEntries([SELF,join(import.meta.dir,"local-retrieval-snapshot.ts"),join(import.meta.dir,"engine-workload-adapters.ts"),join(SCRIPTS,"lib/semantic.ts"),join(SCRIPTS,"lib/semantic-worker.mjs"),join(SCRIPTS,"kb-find.ts"),join(SCRIPTS,"lib/read-store.ts")].map(p=>[p,digest(readFileSync(p))]));
 const modelPaths=engine==="qmd"?[model]:["model.safetensors","tokenizer/tokenizer.json","tokenizer/tokenizer_config.json"].map(p=>join(deps,"models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7",p));
 const modelHashes=Object.fromEntries(modelPaths.map(p=>[p,digest(readFileSync(p))]));
 const report:any={schema:"organon.private-semantic-replay.v2",started:new Date().toISOString(),engine,label:capture.label,captureHash:capture.manifestHash,root,hashes,modelHashes,cpuOnly:true,steps:[],limitations:["Private full corpus; query titles are latency probes, not independent semantic relevance labels.","Different models and integration contracts: these are operational stacks, not engine-only comparisons.","QMD uses the current one-shot Promptus adapter with source and model/database verification; zvec uses a benchmark adapter with canonical snapshot checks.","Memory-backed tmpfs, warm OS caches; no durable-disk or original-mount timing or GPU extrapolation.","No external artifacts checked, no scientific truth adjudication."]};
 const save=()=>writeFileSync(join(root,"report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
 const step=async(name:string,f:()=>any)=>{console.error(`${capture.label}/${engine}: ${name}`);const start=performance.now();const result=await f();report.steps.push({name,ms:performance.now()-start,result});save();return result;};
 const run=(file:string,args:string[]=[],input="")=>cmd(root,[process.execPath,join(SCRIPTS,file),...args,"--root",root],input);
 let store:WorkloadEngine|undefined,lastProbe:{id:string;path:string;token:string}|undefined;
 try{
  const initial=semanticSnapshot(root);report.units=initial.documents.length;
  await step("prepare-full-lexical-baseline",async()=>{
   const result=ok(await run("kb-index.ts",["--quiet"]));
   const index=JSON.parse(readFileSync(join(root,".promptus/cache/search.json"),"utf8"));
   if(index.documents.length!==initial.documents.length)throw new Error("incomplete initial lexical corpus");
   return {...safe(result),documents:index.documents.length};
  });
  const eligible=initial.documents.filter(d=>!d.cold&&!["SUPERSEDED","REFUTED","RETIRED"].includes(d.status.toUpperCase()));
  const probes=[0,Math.floor(eligible.length/2),eligible.length-1].map(i=>eligible[i].title.replace(/["+]/g," "));
  writeFileSync(join(root,"queries.json"),JSON.stringify(probes),{mode:0o600});report.queryHash=digest(JSON.stringify(probes));
  const project=()=>{const docs=semanticSnapshot(root).documents;const units=join(root,"units");mkdirSync(units,{recursive:true});const previous=existsSync(join(root,"projection.json"))?JSON.parse(readFileSync(join(root,"projection.json"),"utf8")):[];const wanted=new Set(docs.map(d=>d.file));for(const file of previous)if(!wanted.has(file))unlinkSync(join(units,file));for(const d of docs){const p=join(units,d.file),text=`# ${d.title}\n\n${d.text}`;if(!existsSync(p)||readFileSync(p,"utf8")!==text)writeFileSync(p,text,{mode:0o600});}writeFileSync(join(root,"projection.json"),JSON.stringify([...wanted]),{mode:0o600});return docs.map(d=>({...d,id:d.file.slice(0,-3)}));};
  await step("build",async()=>{
   if(engine==="qmd"){
    const configured=ok(await run("kb-semantic.ts",["configure","--package",join(deps,"node_modules/@tobilu/qmd"),"--node",join(deps,"node_modules/node-linux-x64/bin/node"),"--model",model]));
    const built=ok(await run("kb-semantic.ts",["update"]));return {configure:safe(configured),build:safe(built),receipt:JSON.parse(built.stdout)};
   }
   const docs=project();store=await openEngine("zvec-hybrid",root,deps);return {receipt:await store.update(docs),units:docs.length};
  });
  await step("repeated-retrieval",async()=>{const rows=[];for(let repeat=0;repeat<3;repeat++)for(const query of probes){const start=performance.now();
   if(engine==="qmd"){const r=ok(await run("kb-find.ts",[query,"--semantic","--limit","5"]));if(!r.stdout.includes("route:qmd"))throw new Error("semantic query fell back");rows.push(safe(r));}
   else{const before=semanticSnapshot(root);const ids=await store!.query(query);if(semanticSnapshot(root).fingerprint!==before.fingerprint)throw new Error("source raced");rows.push({ms:performance.now()-start,candidates:ids.length,rssBytes:process.memoryUsage().rss});}
  }return rows;});
  await step("single-write-immediate-read-refresh",async()=>{const rows=[];for(let i=0;i<3;i++){
   const token=`cpusemanticreplay${["amber","cobalt","violet"][i]}`,added=ok(await run("kb-add.ts",["--substrate","finding","--kind","CLAIM","--status","VALIDATED","--title",`Synthetic ${token} orchard irrigation procedure`,"--json"],`Fictional test procedure only. ${token} waters apple trees when soil is dry. Not a result about the copied research.\n`));
   const {id,path}=JSON.parse(added.stdout);lastProbe={id,path,token};const immediate=ok(await run("kb-find.ts",[token,...(engine==="qmd"?["--semantic"]:[]),"--limit","5"]));
   if(!immediate.stdout.includes(token))throw new Error("new lexical record missing");if(engine==="qmd"&&!immediate.stdout.includes("lexical-fallback"))throw new Error("stale semantic route did not fall back");
   const start=performance.now();let refresh:any,query:any;
   if(engine==="qmd"){const r=ok(await run("kb-semantic.ts",["update"]));refresh=safe(r);const q=ok(await run("kb-find.ts",[`${token} orchard irrigation procedure`,"--semantic","--limit","20"]));if(!q.stdout.includes("route:qmd")||!q.stdout.includes(token))throw new Error("updated semantic probe missing");query=safe(q);}
   else{const docs=project();refresh={receipt:await store!.update(docs),ms:performance.now()-start};const doc=semanticSnapshot(root).documents.find(d=>d.id===id)!;const body=await store!.indexedText(doc.file.slice(0,-3));if(!body?.includes(token))throw new Error("indexed new body missing");const qs=performance.now(),hits=await store!.query(`${token} orchard irrigation procedure`);query={ms:performance.now()-qs,candidates:hits.length,probeFound:hits.includes(doc.file.slice(0,-3))};if(!query.probeFound)throw new Error("zvec probe missing");}
   rows.push({write:safe(added),immediateRead:safe(immediate),refresh,query});
  }return rows;});
  await step("gated-refutation",async()=>{
   const probe=lastProbe!;ok(await run("kb-amend.ts",["--path",probe.path,"--substrate","finding","--kind","CLAIM","--status","REFUTED"]));
   if(engine==="qmd"){
    const refresh=ok(await run("kb-semantic.ts",["update"]));const active=ok(await run("kb-find.ts",[probe.token,"--semantic","--limit","20"])),historical=ok(await run("kb-find.ts",[probe.token,"--semantic","--status","REFUTED","--limit","20"]));
    if(!active.stdout.includes("route:qmd")||active.stdout.includes(probe.path)||!historical.stdout.includes(probe.path))throw new Error("semantic lifecycle boundary failed");return {refresh:safe(refresh),active:safe(active),historical:safe(historical)};
   }
   const docs=project();await store!.update(docs);const doc=semanticSnapshot(root).documents.find(d=>d.id===probe.id)!;
   const text=await store!.indexedText(doc.file.slice(0,-3));if(doc.status!=="REFUTED"||!text?.includes("status: REFUTED"))throw new Error("zvec stored lifecycle body stale");
   return {canonicalStatus:doc.status,indexedBodyCurrent:true,note:"Raw zvec search has no Promptus lifecycle policy; canonical filtering remains adapter-owned."};
  });
  if(engine==="qmd")await step("missing-semantic-configuration-fallback",async()=>{
   const file=join(semanticBase(root),"config.json"),hidden=file+".test-disabled";renameSync(file,hidden);
   try{const r=ok(await run("kb-find.ts",[lastProbe!.token,"--semantic","--limit","5"]));if(!r.stdout.includes("lexical-fallback"))throw new Error("missing configuration did not fall back");return safe(r);}finally{renameSync(hidden,file);}
  });
  if(store){await store.close();store=undefined;await step("fresh-process-zvec-query",async()=>{const r=ok(await cmd(root,[process.execPath,SELF,"query",root,deps,"0"]));return {...safe(r),result:JSON.parse(r.stdout)};});}
  await step("frozen-source-preserved",()=>({verified:assertSnapshot(snapshot).verified}));report.passed=true;
 }catch(error){report.passed=false;report.failure=String(error);console.error(`${capture.label}/${engine}: ${report.failure}`);}
 finally{await store?.close();}
 report.changedCode=Object.entries(hashes).filter(([p,h])=>digest(readFileSync(p))!==h).map(([p])=>p);report.changedModels=Object.entries(modelHashes).filter(([p,h])=>digest(readFileSync(p))!==h).map(([p])=>p);if(report.changedCode.length||report.changedModels.length)report.passed=false;
 report.completed=new Date().toISOString();save();console.log(JSON.stringify({root,report:join(root,"report.json"),passed:report.passed}));return report.passed?0:1;
}
if(import.meta.main){globalThis.fetch=(async()=>{throw new Error("offline CPU replay");}) as typeof fetch;Object.assign(process.env,ENV);const [action,root,deps,engine]=process.argv.slice(2);
 if(action==="run")process.exitCode=await main(root,deps,engine);
 else if(action==="query"){assertWork(root);dependencies(deps);const query=JSON.parse(readFileSync(join(root,"queries.json"),"utf8"))[Number(engine)],start=performance.now(),store=await openEngine("zvec-hybrid",root,deps);try{const hits=await store.query(query);console.log(JSON.stringify({ms:performance.now()-start,candidates:hits.length,rssBytes:process.memoryUsage().rss}));}finally{await store.close();}}
 else throw new Error("usage: local-semantic-replay.ts run VERIFIED_SNAPSHOT STAGED_DEPENDENCIES qmd|zvec");}
