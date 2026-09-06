/** Fresh-process experiment port; refuses unmarked roots. */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { configure, exactFetch, fixture, readThrough } from "./publication-fence.ts";
import { SCRIPTS } from "./publication-fixture.ts";

const [root, arm, verb, ...args] = process.argv.slice(2);
try {
  const marked = fixture(root);
  if (!["baseline", "fenced"].includes(arm) || !["add", "amend", "find", "get", "index"].includes(verb) || args.includes("--root")) throw Error("invalid experiment invocation");
  const scripts = arm === "baseline" ? SCRIPTS : join(marked.runtime, "scripts");
  const invoke = () => {
    const result = spawnSync(process.execPath, [join(scripts, `kb-${verb}.ts`), "--root", root, ...args], { encoding: "utf8", input: verb === "add" ? "Synthetic publication write: freshquartzsignal.\n" : undefined, timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(result.stderr || `child failed: ${result.status}/${result.signal}`);
    return { output: result.stdout, diagnostics: result.stderr };
  };
  if (arm === "baseline" || verb === "add" || verb === "amend") console.log(JSON.stringify(invoke()));
  else {
    configure(root);
    const { buildIndex } = await import(join(scripts, "kb-index.ts"));
    console.log(JSON.stringify(readThrough(root, () => { if (buildIndex(["--root", root, "--quiet"]).exitCode !== 0) throw Error("index rebuild failed"); }, () => {
      if (verb === "index") return { output: "reconciled", diagnostics: "" };
      if (verb === "get") {
        const options: Record<string, string> = {};
        for (let i = 1; i < args.length; i += 2) {
          if (!["--title", "--expected-revision"].includes(args[i]) || !args[i + 1] || args[i] in options) throw Error("invalid get options");
          options[args[i]] = args[i + 1];
        }
        return exactFetch(root, args[0], options["--title"], options["--expected-revision"]);
      }
      return invoke();
    }, verb === "index")));
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
