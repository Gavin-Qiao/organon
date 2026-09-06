import { test,expect } from "bun:test";
import { publicQualitySummary } from "./private-quality-report.ts";
const metric={n:2,hit5:1,hit10:1,rr10:0.5,all5:0.5,all10:1,directPrecision5:0.4,usefulPrecision5:0.8};
function fixture(){return {schema:"organon.private-quality-summary.v1",project:"psi",units:10,pooledCandidates:5,query:"PRIVATE_RESEARCH",routes:["lexical","zvec-1","zvec-2"].map(name=>({name,query:"PRIVATE_RESEARCH",groups:Object.fromEntries(["all-positive","conceptual","exact","historical","multi"].map(g=>[g,{...metric,body:"PRIVATE_RESEARCH"}])),unsupported:[{case:"PRIVATE_RESEARCH",returned5:5,directAnswerEvidence5:0}],candidateCounts:[{case:"PRIVATE_RESEARCH",raw:10,eligible:8}]})),stability:[{case:"PRIVATE_RESEARCH",top5Overlap:0.6,orderedEqual:false}]};}
test("public quality output is numeric allowlist, not private source or question passthrough",()=>{
 const result=publicQualitySummary(fixture());expect(JSON.stringify(result)).not.toContain("PRIVATE_RESEARCH");expect(result.routes[0].groups["all-positive"]).toEqual(metric);expect(result.stability.meanTop5Overlap).toBe(0.6);
});
test("public quality output rejects nonnumeric or nonfinite measurements",()=>{
 for(const bad of ["PRIVATE_RESEARCH",Infinity,NaN]){const input=fixture();input.routes[0].groups.multi.hit5=bad as any;expect(()=>publicQualitySummary(input)).toThrow("invalid metric");}
});
