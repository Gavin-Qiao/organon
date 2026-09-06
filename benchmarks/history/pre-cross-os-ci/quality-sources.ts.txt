/** Private frozen-corpus reader for independent evaluation agents; no retrieval engine involved. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertSnapshot, digest } from "./local-retrieval-snapshot.ts";
import { semanticSnapshot } from "../promptus/scripts/lib/semantic.ts";
export const QUALITY_MARKER="organon.private-quality.v1";
export function assertQuality(root:string){
 const physical=realpathSync(root);
 if(!physical.startsWith(realpathSync(tmpdir())+"/organon-quality-")||readFileSync(join(root,"marker"),"utf8")!==QUALITY_MARKER)throw new Error("unmarked private quality workspace");
 return physical;
}
export function corpus(root:string,label:string):any[]{
 assertQuality(root);if(!["psi","mot"].includes(label))throw new Error("invalid project");
 const bytes=readFileSync(join(root,label,"corpus.json")),m=JSON.parse(readFileSync(join(root,label,"manifest.json"),"utf8"));
 if(digest(bytes)!==m.corpusHash)throw new Error("corpus drift");return JSON.parse(bytes.toString());
}
if(import.meta.main){
 const [action,root,label,arg,offset]=process.argv.slice(2);
 if(action==="prepare"){
  const work=mkdtempSync(join(tmpdir(),"organon-quality-"));writeFileSync(join(work,"marker"),QUALITY_MARKER,{mode:0o600});
  for(const [name,snapshot] of [["psi",root],["mot",label]]){
   const capture=assertSnapshot(snapshot),docs=semanticSnapshot(snapshot).documents,dir=join(work,name);mkdirSync(dir);
   const bytes=JSON.stringify(docs);writeFileSync(join(dir,"corpus.json"),bytes,{mode:0o600});
   writeFileSync(join(dir,"manifest.json"),JSON.stringify({label:name,snapshot,captureHash:capture.manifestHash,corpusHash:digest(bytes),units:docs.length,created:new Date().toISOString()},null,2),{mode:0o600});
  }console.log(JSON.stringify({work}));
 }else{
  const docs=corpus(root,label);
  if(action==="headers"){
   const n=Number(arg??100);if(!Number.isInteger(n)||n<1||n>1000)throw new Error("bounded header count required");
   const sorted=[...docs].sort((a,b)=>digest(a.key).localeCompare(digest(b.key)));
   console.log(JSON.stringify(sorted.slice(0,n).map(({key,title,status,substrate,cold,path})=>({key,title,status,substrate,cold,path})),null,2));
  }else if(action==="get"){
   const doc=docs.find(d=>d.key===arg);if(!doc)throw new Error("unknown key");
   const from=Number(offset??0);if(!Number.isSafeInteger(from)||from<0)throw new Error("invalid offset");
   console.log(JSON.stringify({key:doc.key,title:doc.title,status:doc.status,cold:doc.cold,path:doc.path,totalChars:doc.text.length,offset:from,text:doc.text.slice(from,from+14000),more:from+14000<doc.text.length},null,2));
  }else throw new Error("usage: prepare PSI_SNAPSHOT MOT_SNAPSHOT | headers WORK PROJECT [LIMIT] | get WORK PROJECT KEY [OFFSET]");
 }
}
