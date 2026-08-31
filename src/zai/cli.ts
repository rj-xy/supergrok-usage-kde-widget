import { stdout } from "node:process"

import { buildReport, printPretty } from "./fetcher.js"

export async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2).filter(Boolean);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: zai-usage-kde-widget [usage] [--json|--pretty]");
    return 0;
  }
  const pretty = args.includes("--pretty");
  const report = await buildReport();
  if (pretty || (stdout.isTTY && !args.includes("--json")))
    printPretty(report);
  else
    stdout.write(JSON.stringify(report) + "\n");
  const entry = report.entries[0];
  return entry.status === "error" && !entry.stale ? 1 : 0;
}

void main(process.argv).then((code) => {
  process.exitCode = code;
}, (err: unknown) => {
  const message = err instanceof Error ? err.message : "could not fetch Z.ai usage";
  console.error(message);
  process.exitCode = 1;
});
