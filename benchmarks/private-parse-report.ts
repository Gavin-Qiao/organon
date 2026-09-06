/** Numeric analysis only. Input is the aggregate public trial receipt. */
export function stats(values: number[]) {
  if (!values.length || values.some(n => !Number.isFinite(n) || n < 0)) throw Error("invalid numeric sample");
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length/2);
  return { n: values.length, medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2, meanMs: values.reduce((a,b) => a+b, 0)/values.length };
}
export function analyze(report: any) {
  if (report.schema !== "organon.private-parse-trial.v1") throw Error("unsupported receipt");
  return report.projects.map((project: any) => {
    if (!project.passed) return { label: project.label, passed: false, failure: project.failure };
    const arms = Object.fromEntries(["full", "reuse"].map(arm => {
      const a = project.arms[arm];
      // The pinned queryCases generator, after dropping its blank-query case,
      // yields eight ordinary/control queries and three phrase-only queries.
      if (a.queryCases !== 11) throw Error("query stratification needs review");
      const clean = a.clean.map((x: any) => x.ms);
      return [arm, { workflow: stats(a.traces.map((x: any) => x.workflowMs)), tenReads: stats(a.traces.map((x: any) => x.totalMs)), clean: stats(clean),
        ordinary: stats(a.clean.filter((x: any) => x.caseOrdinal < 8).map((x: any) => x.ms)),
        phrase: stats(a.clean.filter((x: any) => x.caseOrdinal >= 8).map((x: any) => x.ms)),
        cacheBytes: a.cacheBytes, derivedBytes: a.derivedBytes,
        maxSampledTreeRssKiB: Math.max(a.initialIndex.sampledTreeRssKiB, ...a.clean.map((x: any) => x.sampledTreeRssKiB), ...a.traces.flatMap((x: any) => [x.write, x.find, x.get].map((r: any) => r.sampledTreeRssKiB))),
        maxLogicalPeakBoundBytes: Math.max(...a.traces.map((x: any) => x.logicalPeakBoundBytes)),
      }];
    })) as any;
    return { label: project.label, passed: true, arms,
      hundredReadEstimatedMs: Object.fromEntries(["full", "reuse"].map(arm => [arm, arms[arm].workflow.meanMs + 100*arms[arm].clean.meanMs])),
      hundredOrdinaryReadEstimatedMs: Object.fromEntries(["full", "reuse"].map(arm => [arm, arms[arm].workflow.meanMs + 100*arms[arm].ordinary.meanMs])),
      note: "Strata and 100-read weighting explain this controlled workload, not observed agent query frequencies." };
  });
}
if (import.meta.main) {
  if (process.argv.length !== 3) throw Error("usage: private-parse-report.ts PUBLIC_RECEIPT.json");
  console.log(JSON.stringify(analyze(await Bun.file(process.argv[2]).json()), null, 2));
}
