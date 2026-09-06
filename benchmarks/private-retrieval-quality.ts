/** Exploratory, private, frozen-question evaluation. Never reads or writes live projects. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertQuality, corpus } from "./quality-sources.ts";
import { assertSnapshot, digest } from "./local-retrieval-snapshot.ts";
import { openEngine } from "./engine-workload-adapters.ts";
import { buildSearchIndex, searchIndex } from "../promptus/scripts/lib/search.ts";

export const SCHEMA = "organon.retrieval-quality-questions.v1";
export type Question = { id:string; category:string; query:string; scope:{history:boolean}; expectedAnswer:string;
 requiredEvidence:{anyOf:string[]; rationale:string; quote:string}[]; absenceRationale?:string };
const normal = (s:string) => s.replace(/\s+/g," ").trim();
export const eligible = (doc:any, q:Question) => q.scope.history || (!doc.cold && !["UNTRUSTED","REFUTED","SUPERSEDED","RETIRED"].includes(doc.status.replace(/^[★⚠↩]/," ").trim().toUpperCase()));
export function validateQuestions(suite:any, project:string, docs:any[]):Question[]{
 if(suite.schema!==SCHEMA || suite.project!==project || suite.cases?.length!==12)throw new Error("invalid question envelope");
 const byKey=new Map(docs.map(d=>[d.key,d])), ids=new Set(), counts:Record<string,number>={};
 for(const q of suite.cases as Question[]){
  if(!new RegExp(`^${project}-[0-9]{1,2}$`).test(q.id)||ids.has(q.id)||!q.query?.trim()||!q.expectedAnswer?.trim()||typeof q.scope?.history!=="boolean"||!Array.isArray(q.requiredEvidence))throw new Error("invalid question fields");
  ids.add(q.id);counts[q.category]=(counts[q.category]??0)+1;
  if(q.category==="absence") { if(q.requiredEvidence.length||!q.absenceRationale?.trim())throw new Error("invalid absence case"); }
  else if(q.requiredEvidence.length<(q.category==="multi"?2:1))throw new Error("missing required evidence");
  if((q.category==="historical")!==q.scope.history)throw new Error("unexpected historical scope");
  for(const group of q.requiredEvidence){
   if(!group.anyOf?.length||!group.rationale?.trim()||!group.quote?.trim())throw new Error("incomplete evidence group");
   for(const key of group.anyOf){const d=byKey.get(key);if(!d||!eligible(d,q))throw new Error(`${q.id}: missing/ineligible key`);}
   if(!group.anyOf.some(key=>normal(byKey.get(key).text).includes(normal(group.quote))))throw new Error(`${q.id}: supporting quote not found`);
  }
  if(q.category==="multi"&&q.requiredEvidence.some((g,i)=>q.requiredEvidence.slice(i+1).some(h=>g.anyOf.some(k=>h.anyOf.includes(k)))))throw new Error("multi-evidence groups must be disjoint");
 }
 if(JSON.stringify(Object.entries(counts).sort())!==JSON.stringify(Object.entries({conceptual:4,exact:2,historical:2,multi:2,absence:2}).sort()))throw new Error("wrong category balance");
 return suite.cases;
}
function read(path:string){return JSON.parse(readFileSync(path,"utf8"));}
function publish(path:string,data:any){if(existsSync(path))throw new Error(`refuse overwrite: ${path}`);writeFileSync(path,JSON.stringify(data,null,2),{mode:0o600,flag:"wx"});}
function dependencyHashes(dependencies:string){
 const model="models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7/";
 return Object.fromEntries(["node_modules/@zvec/zvec-grep/package.json",model+"model.safetensors",model+"tokenizer/tokenizer.json",model+"tokenizer/tokenizer_config.json"].map(p=>[p,digest(readFileSync(join(dependencies,p)))]));
}
function sourceHashes(){return Object.fromEntries(["private-retrieval-quality.ts","quality-sources.ts","engine-workload-adapters.ts","../promptus/scripts/lib/search.ts"].map(p=>[p,digest(readFileSync(join(import.meta.dir,p)))]));}
export function targetMetrics(q:Question,keys:string[]){
 const ranks=q.requiredEvidence.map(g=>{const rank=keys.findIndex(k=>g.anyOf.includes(k));return rank<0?Infinity:rank+1;});
 const best=Math.min(...ranks);
 return {hit5:Number(best<=5),hit10:Number(best<=10),rr10:best<=10?1/best:0,all5:Number(ranks.length>0&&ranks.every(r=>r<=5)),all10:Number(ranks.length>0&&ranks.every(r=>r<=10))};
}
function frozen(root:string,project:string){
 const dir=join(assertQuality(root),project),docs=corpus(root,project),bytes=readFileSync(join(dir,"questions.json")),questions=validateQuestions(JSON.parse(bytes.toString()),project,docs),seal=read(join(dir,"freeze.json"));
 if(seal.questionsHash!==digest(bytes)||seal.corpusHash!==read(join(dir,"manifest.json")).corpusHash)throw new Error("frozen inputs drifted");
 if(seal.runnerHash!==digest(readFileSync(import.meta.path)))throw new Error("frozen runner drifted");
 if(JSON.stringify(seal.sourceHashes)!==JSON.stringify(sourceHashes()))throw new Error("frozen source dependencies drifted");
 const capture=read(join(dir,"manifest.json"));if(assertSnapshot(capture.snapshot).manifestHash!==capture.captureHash)throw new Error("capture drifted");
 return {dir,docs,questions,seal};
}
export function poolCases(questions:Question[],routes:any[],docs:any[],seed:string){
 const map=new Map(docs.map(d=>[d.key,d]));
 return questions.map(q=>({id:q.id,query:q.query,scope:q.scope,candidates:[...new Set<string>(routes.flatMap(r=>r.cases.find((c:any)=>c.id===q.id).keys.slice(0,5)))].sort((a,b)=>digest(seed+q.id+a).localeCompare(digest(seed+q.id+b))).map(key=>{
  const d=map.get(key);return {key,title:d.title,status:d.status,cold:d.cold,text:d.text};
 })}));
}
if(import.meta.main){
 const [action,root,project,arg]=process.argv.slice(2),dir=join(assertQuality(root),project);
 if(action==="freeze"){
  const docs=corpus(root,project),bytes=readFileSync(join(dir,"questions.json")),questions=validateQuestions(JSON.parse(bytes.toString()),project,docs);
  publish(join(dir,"freeze.json"),{schema:"organon.quality-freeze.v1",created:new Date().toISOString(),questionsHash:digest(bytes),corpusHash:read(join(dir,"manifest.json")).corpusHash,questions:questions.length,runnerHash:digest(readFileSync(import.meta.path)),sourceHashes:sourceHashes()});
  console.log(JSON.stringify({project,frozen:questions.length}));
 }else if(action==="run"){
  const {docs,questions,seal}=frozen(root,project),byKey=new Map(docs.map(d=>[d.key,d]));
  if(existsSync(join(dir,"routes.json")))throw new Error("routes already published");
  const deps=dependencyHashes(arg),lex=buildSearchIndex(docs,seal.corpusHash),routes:any[]=[];
  routes.push({name:"lexical",cases:questions.map(q=>{
   const raw=searchIndex(lex,q.query,{history:q.scope.history,includeInactive:q.scope.history},d=>byKey.get(d.key).text).map(h=>h.document.key);
   return {id:q.id,rawCount:raw.length,keys:raw.filter(k=>eligible(byKey.get(k),q)).slice(0,100)};
  })});
  Object.assign(process.env,{CUDA_VISIBLE_DEVICES:"",HIP_VISIBLE_DEVICES:"",ROCR_VISIBLE_DEVICES:"",QMD_FORCE_CPU:"1",NODE_LLAMA_CPP_SKIP_DOWNLOAD:"true",HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1"});
  globalThis.fetch=async()=>{throw new Error("offline quality trial forbids fetch");};
  for(let build=1;build<=2;build++){
   const scratch=join(dir,`build-${build}`);mkdirSync(join(scratch,"units"),{recursive:true});
   const toKey=new Map<string,string>();
   for(const d of docs){const opaque=digest(d.key);toKey.set(opaque,d.key);writeFileSync(join(scratch,"units",opaque+".md"),`# ${d.title}\n\n${d.text}`,{mode:0o600,flag:"wx"});}
   const engine=await openEngine("zvec-hybrid",scratch,arg);
   try{
    const start=performance.now(),receipt:any=await engine.update([]),buildMs=performance.now()-start,cases=[];
    if(receipt.filesScanned!==docs.length||receipt.filesAdded!==docs.length||receipt.filesFailed!==0||receipt.filesPending!==0)throw new Error("incomplete vector index");
    for(const q of questions){
     const start=performance.now(),raw=(await engine.query(q.query)).map(k=>{const key=toKey.get(k);if(!key)throw new Error("unknown indexed identity");return key;});
     cases.push({id:q.id,rawCount:raw.length,keys:raw.filter(k=>eligible(byKey.get(k),q)),queryMs:performance.now()-start});
    }
    const route={name:`zvec-${build}`,buildMs,receipt,cases};publish(join(dir,`route-zvec-${build}.json`),route);routes.push(route);
   }finally{await engine.close();}
  }
  frozen(root,project);if(JSON.stringify(deps)!==JSON.stringify(dependencyHashes(arg)))throw new Error("model or package drifted");
  publish(join(dir,"routes.json"),{freeze:seal,dependencies:deps,routes});
  publish(join(dir,"blind-pool.json"),{schema:"organon.blind-quality-pool.v1",project,cases:poolCases(questions,routes,docs,seal.questionsHash)});
  console.log(JSON.stringify({project,complete:true,routes:routes.length,poolCases:questions.length}));
 }else if(action==="summarize"){
  const {docs,questions,seal}=frozen(root,project),routes=read(join(dir,"routes.json")).routes,pool=read(join(dir,"blind-pool.json")),judgments=read(join(dir,"judgments.json"));
  if(judgments.schema!=="organon.blind-quality-judgments.v1"||judgments.project!==project||judgments.cases.length!==questions.length)throw new Error("invalid judgment envelope");
  const byKey=new Map(docs.map(d=>[d.key,d])),byCase=new Map<string,Map<string,number>>();
  for(const c of pool.cases){
   const found=judgments.cases.filter((j:any)=>j.id===c.id);if(found.length!==1)throw new Error("missing/duplicate judged case");
   const j=found[0];if(j.ratings.length!==c.candidates.length)throw new Error("pool judgment coverage mismatch");
   const ratings=new Map<string,number>();
   for(const r of j.ratings){
    if(!c.candidates.some((x:any)=>x.key===r.key)||ratings.has(r.key)||![0,1,2].includes(r.grade)||!r.rationale?.trim())throw new Error("invalid rating");
    if(r.grade>0&&(!r.quote?.trim()||!normal(byKey.get(r.key).text).includes(normal(r.quote))))throw new Error("unverifiable relevance quote");
    ratings.set(r.key,r.grade);
   }byCase.set(c.id,ratings);
  }
  const positive=questions.filter(q=>q.category!=="absence"),groups=["all-positive","conceptual","exact","historical","multi"];
  const aggregate=(qs:Question[],r:any)=>{
   const totals={hit5:0,hit10:0,rr10:0,all5:0,all10:0,directPrecision5:0,usefulPrecision5:0};
   for(const q of qs){const keys=r.cases.find((c:any)=>c.id===q.id).keys,m=targetMetrics(q,keys);for(const key of Object.keys(m))totals[key]+=m[key];
    totals.directPrecision5+=keys.slice(0,5).filter((k:string)=>byCase.get(q.id)!.get(k)===2).length/5;
    totals.usefulPrecision5+=keys.slice(0,5).filter((k:string)=>(byCase.get(q.id)!.get(k)??0)>0).length/5;
   }return {n:qs.length,...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/qs.length]))};
  };
  const result={schema:"organon.private-quality-summary.v1",project,units:docs.length,freeze:seal,
   dependencies:read(join(dir,"routes.json")).dependencies,privateReceipts:Object.fromEntries(["manifest.json","questions.json","routes.json","blind-pool.json","judgments.json"].map(f=>[f,digest(readFileSync(join(dir,f)))])),
   pooledCandidates:pool.cases.reduce((n:number,c:any)=>n+c.candidates.length,0),
   routes:routes.map((r:any)=>({name:r.name,groups:Object.fromEntries(groups.map(g=>[g,aggregate(g==="all-positive"?positive:positive.filter(q=>q.category===g),r)])),
    unsupported:questions.filter(q=>q.category==="absence").map(q=>({case:q.id,returned5:Math.min(5,r.cases.find((c:any)=>c.id===q.id).keys.length),directAnswerEvidence5:r.cases.find((c:any)=>c.id===q.id).keys.slice(0,5).filter((k:string)=>byCase.get(q.id)!.get(k)===2).length})),
    candidateCounts:r.cases.map((c:any)=>({case:c.id,raw:c.rawCount,eligible:c.keys.length}))})),
   stability:questions.map(q=>{const a=routes[1].cases.find((c:any)=>c.id===q.id).keys.slice(0,5),b=routes[2].cases.find((c:any)=>c.id===q.id).keys.slice(0,5);return {case:q.id,top5Overlap:a.filter((k:string)=>b.includes(k)).length/5,orderedEqual:JSON.stringify(a)===JSON.stringify(b)};})};
  publish(join(dir,"summary.json"),result);console.log(JSON.stringify(result));
 }else throw new Error("usage: freeze ROOT PROJECT | run ROOT PROJECT DEPENDENCIES | summarize ROOT PROJECT");
}
