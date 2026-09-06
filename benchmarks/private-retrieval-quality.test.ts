import { expect,test } from "bun:test";
import { eligible,poolCases,targetMetrics,validateQuestions,SCHEMA,type Question } from "./private-retrieval-quality.ts";
const q:Question={id:"psi-01",category:"conceptual",query:"a question",scope:{history:false},expectedAnswer:"answer",requiredEvidence:[{anyOf:["a"],rationale:"because",quote:"evidence words"}]};
const docs=[{key:"a",title:"A",text:"some evidence words here",status:"VALIDATED",cold:false},{key:"b",title:"B",text:"other source",status:"REFUTED",cold:true},{key:"c",title:"C",text:"independent evidence",status:"VALIDATED",cold:false}];
test("explicit scope excludes inactive and cold, historical admits them",()=>{
 expect(eligible(docs[0],q)).toBe(true);expect(eligible(docs[1],q)).toBe(false);
 expect(eligible(docs[1],{...q,scope:{history:true}})).toBe(true);
 expect(eligible({...docs[0],status:"⚠UNTRUSTED"},q)).toBe(false);
});
test("known-target metrics distinguish any evidence from all evidence and cutoff",()=>{
 const multi={...q,requiredEvidence:[...q.requiredEvidence,{anyOf:["b","c"],rationale:"other",quote:"source"}]};
 expect(targetMetrics(multi,["x","a"])).toEqual({hit5:1,hit10:1,rr10:0.5,all5:0,all10:0});
 expect(targetMetrics(multi,["c","a"]).all5).toBe(1);
 expect(targetMetrics(q,Array(10).fill("x").concat("a")).rr10).toBe(0);
 expect(targetMetrics({...q,requiredEvidence:[]},["a"]).all5).toBe(0);
});
test("pool removes route and rank labels and deduplicates source identities",()=>{
 const routes=[{name:"lexical",cases:[{id:q.id,keys:["a","b"]}]},{name:"zvec-1",cases:[{id:q.id,keys:["b","a"]}]}];
 const result=poolCases([q],routes,docs,"seed");
 expect(result[0].candidates.length).toBe(2);expect(JSON.stringify(result)).not.toContain("lexical");
 expect(JSON.stringify(result)).not.toContain("expectedAnswer");expect(JSON.stringify(result)).not.toContain("requiredEvidence");
 expect(poolCases([q],routes,docs,"seed")).toEqual(result);
});
function suite(){const categories=[...Array(4).fill("conceptual"),"exact","exact","historical","historical","multi","multi","absence","absence"];
 return {schema:SCHEMA,project:"psi",cases:categories.map((category,i)=>({...q,id:`psi-${i+1}`,category,scope:{history:category==="historical"},requiredEvidence:category==="absence"?[]:category==="multi"?[...q.requiredEvidence,{anyOf:["c"],rationale:"second",quote:"independent"}]:q.requiredEvidence,absenceRationale:category==="absence"?"unsupported":undefined}))};}
test("question gate validates category counts, source identity, lifecycle, exact quotes and uniqueness",()=>{
 expect(validateQuestions(suite(),"psi",docs).length).toBe(12);
 for(const mutate of [(s:any)=>s.cases[0].requiredEvidence=[{anyOf:["missing"],rationale:"why",quote:"evidence words"}],(s:any)=>s.cases[0].requiredEvidence=[{anyOf:["a"],rationale:"why",quote:"fabricated"}],(s:any)=>s.cases[0].id=s.cases[1].id,(s:any)=>s.cases[0].scope.history=true,(s:any)=>s.cases[11].requiredEvidence=q.requiredEvidence]){
  const s=suite();mutate(s);expect(()=>validateQuestions(s,"psi",docs)).toThrow();
 }
});
