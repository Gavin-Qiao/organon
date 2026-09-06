/** Explicit allowlist: private corpora, queries, ranks, paths and logs never enter the public report. */
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "./local-retrieval-snapshot.ts";
const stats=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,medianMs:s[Math.floor(s.length/2)],minMs:s[0],maxMs:s.at(-1)};};
export function summarize(r:any,receiptHash:string){
 const get=(name:string)=>r.steps.find((s:any)=>s.name===name),base:any={label:r.label,engine:r.engine??"lexical-sqlite",passed:r.passed,started:r.started,completed:r.completed,captureHash:r.captureHash,units:r.units,privateReceiptHash:receiptHash,codeUnchanged:r.changedCode?.length===0};
 if(!r.passed){base.failure="Run did not complete; private failure receipt retained. No successful-performance claim.";return base;}
 if(!r.engine){
  const cold=get("fresh-process-query").result,loops=get("individual-write-read-loops").result,warm=get("warm-query-suite").result;
  Object.assign(base,{sourceFiles:r.sourceFiles,sourceBytes:r.sourceBytes,canonical:get("canonical-preflight").result,initialIndexMs:get("current-index").result.ms,sqliteBuildMs:get("sqlite-build").result.timingsMs.total,sqliteBytes:get("sqlite-build").result.databaseBytes,exactQueryCases:get("exact-query-equivalence").result.comparisons.length,exactInitialQueries:get("exact-query-equivalence").result.comparisons.every((x:any)=>x.exact),exactPostWriteQueries:loops.every((x:any)=>x.exactQueries&&x.exactLogical&&x.newIdFound),lifecycleAndRestart:true,lexicalWarm:stats(warm.lexical.samplesMs),sqliteWarm:stats(warm.sqlite.samplesMs),jsonFresh:stats(cold.filter((x:any)=>x.backend==="json").map((x:any)=>x.ms)),sqliteFresh:stats(cold.filter((x:any)=>x.backend==="sqlite").map((x:any)=>x.ms)),freshResultHashesAgree:[0,2,4].every(i=>cold[i].result.resultHash===cold[i+1].result.resultHash),writes:stats(loops.map((x:any)=>x.write.ms)),immediateLexicalRead:stats(loops.map((x:any)=>x.immediateRead.ms)),deltaPreparation:stats(loops.map((x:any)=>x.preparationMs)),sqlDeltaWall:stats(loops.map((x:any)=>x.deltaWallMs)),fullIndex:stats(loops.map((x:any)=>x.fullIndex.ms)),writeAndDelta:stats(loops.map((x:any)=>x.deltaPipelineMs)),jsonFreshPeakRssKiB:Math.max(...cold.filter((x:any)=>x.backend==="json").map((x:any)=>x.resource.maxRssKiB)),sqliteFreshPeakRssKiB:Math.max(...cold.filter((x:any)=>x.backend==="sqlite").map((x:any)=>x.resource.maxRssKiB))});
 }else{
  const loops=get("single-write-immediate-read-refresh").result,reads=get("repeated-retrieval").result;
  Object.assign(base,{buildMs:get("build").ms,repeatedRead:stats(reads.map((x:any)=>x.ms)),write:stats(loops.map((x:any)=>x.write.ms)),immediateLexicalRead:stats(loops.map((x:any)=>x.immediateRead.ms)),singleRecordRefresh:stats(loops.map((x:any)=>x.refresh.ms)),postRefreshQuery:stats(loops.map((x:any)=>x.query.ms)),refutationChecked:!!get("gated-refutation"),missingConfigurationFallback:!!get("missing-semantic-configuration-fallback"),freshZvecQuery:get("fresh-process-zvec-query")?.result.ms??null,maxReportedRssKiB:Math.max(0,...reads.map((x:any)=>x.resource?.maxRssKiB??(x.rssBytes??0)/1024),get("build").result.build?.resource?.maxRssKiB??0),semanticQuality:"Not scored: title and synthetic insertion probes are not independent relevance labels."});
 }
 return base;
}
if(import.meta.main){const [output,...files]=process.argv.slice(2),allowed=join(resolve(import.meta.dir),"results");if(!output||resolve(output)!==join(allowed,"local-cpu-replay-2026-09-05.json")||existsSync(output)||!files.length)throw new Error("expected new dated public receipt and private input paths");
 const results=files.map(file=>{if(!realpathSync(file).startsWith(realpathSync(tmpdir())+"/organon-"))throw new Error("input must be a retained private replay");const bytes=readFileSync(file),raw=JSON.parse(bytes.toString()),summary=summarize(raw,digest(bytes));
  if(!raw.passed&&raw.engine==="qmd"){
   const log=String(raw.failure).split("private logs: ")[1];
   if(log&&realpathSync(log).startsWith(realpathSync(dirname(file))+"/process-logs/")){
    const stderr=readFileSync(join(log,"stderr"),"utf8"),m=stderr.match(/__RESOURCE__ ([\d.]+) ([\d.]+) (\d+)/);
    Object.assign(summary,{failureClass:stderr.includes("ETIMEDOUT")?"INITIAL_BUILD_TIMEOUT":"OTHER_FAILURE",elapsedMs:Date.parse(raw.completed)-Date.parse(raw.started),stderrHash:digest(stderr),resource:m?{userSeconds:+m[1],systemSeconds:+m[2],maxRssKiB:+m[3]}:null});
   }
   const concurrent=join(dirname(file),"concurrent-read.json");if(existsSync(concurrent))summary.concurrentFallback=JSON.parse(readFileSync(concurrent,"utf8"));
  }return summary;});
 const report={schema:"organon.local-cpu-replay-summary.v1",created:new Date().toISOString(),filesystem:"tmpfs: memory-backed; verified with df -T and stat -f",results,limitations:["Read-only captures of latest local Psi/MoT at the recorded capture boundary; all benchmark mutations occur in independent temporary copies.","Temporary filesystem is tmpfs (RAM-backed), not persistent ext4 disk or the original Windows 9p mount. Durable-disk flush cost is not measured.","SQL delta includes source-scan preparation but is benchmark-only, not an atomic source-plus-index production transaction.","Semantic stacks use different models and verification paths; no engine-only or relevance superiority claim.","Private text, queries, ranked identities, embeddings and logs are excluded from this public receipt."]};writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output,runs:results.length,allPassed:results.every(r=>r.passed)}));}
