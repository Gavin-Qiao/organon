import { expect, test } from "bun:test";
import { summarize } from "./local-retrieval-report.ts";
test("public failure summary never propagates private errors, paths, queries or bodies",()=>{
 const secret="PRIVATE_RESEARCH_SENTINEL";
 const result=summarize({label:"psi",passed:false,root:secret,failure:secret,queries:[secret],steps:[{name:"failed",result:secret}],changedCode:[]},"a".repeat(64));
 expect(JSON.stringify(result)).not.toContain(secret);expect(result.passed).toBe(false);
});
test("public semantic summary uses numeric allowlist and no raw SDK result",()=>{
 const secret="PRIVATE_RESEARCH_SENTINEL",command={ms:10,resource:{maxRssKiB:20},log:secret,stdout:secret};
 const r={label:"mot",engine:"qmd",passed:true,changedCode:[],steps:[
  {name:"build",ms:100,result:{build:command,receipt:{source:secret}}},
  {name:"repeated-retrieval",result:[command]},
  {name:"single-write-immediate-read-refresh",result:[{write:command,immediateRead:command,refresh:command,query:command}]},
  {name:"gated-refutation",result:{body:secret}},
 ]};
 const result=summarize(r,"b".repeat(64));expect(JSON.stringify(result)).not.toContain(secret);expect(result.repeatedRead.medianMs).toBe(10);expect(result.refutationChecked).toBe(true);
});
