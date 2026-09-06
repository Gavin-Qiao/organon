/** Public numeric allowlist: never export private questions, source identities or judgments. */
import { readFileSync,writeFileSync } from "node:fs";
import { join,resolve } from "node:path";
import { assertQuality } from "./quality-sources.ts";
import { digest } from "./local-retrieval-snapshot.ts";
const metrics=["hit5","hit10","rr10","all5","all10","directPrecision5","usefulPrecision5"];
export function publicQualitySummary(s:any){
 if(s.schema!=="organon.private-quality-summary.v1"||!["psi","mot"].includes(s.project))throw new Error("invalid private summary");
 const numeric=(n:any)=>{if(typeof n!=="number"||!Number.isFinite(n))throw new Error("invalid metric");return n;};
 return {project:s.project,units:numeric(s.units),pooledCandidates:numeric(s.pooledCandidates),
  routes:["lexical","zvec-1","zvec-2"].map(name=>{
   const r=s.routes.find((r:any)=>r.name===name);return {name,groups:Object.fromEntries(["all-positive","conceptual","exact","historical","multi"].map(g=>[g,{n:numeric(r.groups[g].n),...Object.fromEntries(metrics.map(m=>[m,numeric(r.groups[g][m])]))}])),
    unsupported:{questions:r.unsupported.length,returned5:r.unsupported.reduce((n:number,x:any)=>n+numeric(x.returned5),0),directAnswerEvidence5:r.unsupported.reduce((n:number,x:any)=>n+numeric(x.directAnswerEvidence5),0)},
    candidates:{questions:r.candidateCounts.length,minEligible:Math.min(...r.candidateCounts.map((x:any)=>numeric(x.eligible))),maxEligible:Math.max(...r.candidateCounts.map((x:any)=>numeric(x.eligible))),meanRaw:r.candidateCounts.reduce((n:number,x:any)=>n+numeric(x.raw),0)/r.candidateCounts.length}};
  }),stability:{questions:s.stability.length,meanTop5Overlap:s.stability.reduce((n:number,x:any)=>n+numeric(x.top5Overlap),0)/s.stability.length,exactOrderedTop5:s.stability.filter((x:any)=>x.orderedEqual===true).length}};
}
if(import.meta.main){
 const [root,output]=process.argv.slice(2),work=assertQuality(root);
 if(resolve(output)!==join(import.meta.dir,"results/private-retrieval-quality-2026-09-05.json"))throw new Error("unexpected public output path");
 const results=["psi","mot"].map(p=>{const bytes=readFileSync(join(work,p,"summary.json"));return {...publicQualitySummary(JSON.parse(bytes.toString())),privateSummaryHash:digest(bytes),freezeHash:digest(readFileSync(join(work,p,"freeze.json"))),questionsHash:digest(readFileSync(join(work,p,"questions.json"))),judgmentsHash:digest(readFileSync(join(work,p,"judgments.json")))};});
 const combined=["lexical","zvec-1","zvec-2"].map(name=>({name,groups:Object.fromEntries(["all-positive","conceptual","exact","historical","multi"].map(g=>{const gs=results.map(p=>p.routes.find(r=>r.name===name)!.groups[g]),n=gs.reduce((n,x)=>n+x.n,0);return[g,{n,...Object.fromEntries(metrics.map(m=>[m,gs.reduce((v,x)=>v+x[m]*x.n,0)/n]))}];}))}));
 const report={schema:"organon.public-retrieval-quality.v1",created:new Date().toISOString(),requestedAgentModel:"gpt-5.6-luna",requestedReasoningEffort:"max",authors:2,judges:2,methodAuditors:1,results,combined,
  limitations:["Exploratory 24-question source-conditioned model-labelled pilot; 20 positive and 4 unsupported. One author and one fresh blind judge per project. No human gold, inter-rater agreement or significance claim.","zvec-grep 0.2.1 Potion 32M CPU top 100 context entities, deduplicated then scope-filtered; not an engine-isolated embedding-model comparison.","First vector build is primary; second is replication, never cherry-picked. Known-target coverage is not exhaustive recall. Per-route precision uses fixed five positions from blinded pool judgments.","Unsupported-premise probes do not measure generated-answer hallucination or prove absence. Scientific truth is not determined by retrieval or model judgments.","Runtime, whole dependency native/dist closure and resolved agent model build are not fully pinned. Frozen runner/adapter/lexical source and package manifest/model bytes are bound in private receipts.","No live project, installed plugin or production-source change. Full source verification costs belong to the separate CPU replay. Private text/labels/rankings/vectors remain outside this repository."]};
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output,hash:digest(readFileSync(output)),combined}));
}
