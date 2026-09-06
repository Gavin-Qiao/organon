/** One deliberately concurrent read of a marked private semantic fixture. */
import { readFileSync, realpathSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "./local-retrieval-snapshot.ts";
const [root]=process.argv.slice(2),physical=realpathSync(root);
if(!physical.startsWith(realpathSync(tmpdir())+"/organon-semantic-private-")||readFileSync(join(root,"marker"),"utf8")!=="organon.private-semantic-replay.v1")throw new Error("unmarked fixture");
const lock=join(root,".promptus/cache/semantic/operation.lock"),heldBefore=existsSync(lock),started=new Date().toISOString(),start=performance.now();
const child=Bun.spawn([process.execPath,join(resolve(import.meta.dir,".."),"promptus/scripts/kb-find.ts"),"proof validation","--root",root,"--semantic","--limit","5"],{stdout:"pipe",stderr:"pipe"});
const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
const result={schema:"organon.concurrent-lexical-fallback.v1",started,ms:performance.now()-start,heldBefore,heldAfter:existsSync(lock),exitCode:code,lexicalFallback:stdout.includes("route:lexical-fallback"),boundedLines:stdout.trim().split("\n").length,stdoutHash:digest(stdout),stderrHash:digest(stderr),harnessHash:digest(readFileSync(import.meta.path)),limitation:"One deliberate concurrent read; its CPU contention is included in the ongoing initial-build timing."};
writeFileSync(join(root,"concurrent-read.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});console.log(JSON.stringify(result));
