import { AgentServer } from "./server.js";
import type { ServerMode } from "./types.js";

function parseArgs(args: string[]): { mode: ServerMode; port: number } {
  let mode: ServerMode = "normal";
  let port = 4747;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && i + 1 < args.length) {
      const val = args[i + 1];
      if (val === "normal" || val === "chaos") { mode = val; } else { process.exit(1); }
      i++;
    } else if (args[i] === "--port" && i + 1 < args.length) {
      port = parseInt(args[i + 1]!, 10);
      i++;
    }
  }
  return { mode, port };
}

const { mode, port } = parseArgs(process.argv.slice(2));

console.log("╔══════════════════════════════════════════════╗");
console.log("║         Alchemyst Agent Server v1.0          ║");
console.log("╚══════════════════════════════════════════════╝");

const server = new AgentServer(mode);
server.listen(port);
