import { endpointFromSettings, runBridge } from "./mcp/bridge";

// Separate entry point (out/main/mcp-bridge.js): `ELECTRON_RUN_AS_NODE=1 VNami mcp-bridge.js <settings.json>`.
// See src/main/mcp/bridge.ts and src/main/mcp/claude-desktop.ts.
const settingsPath = process.argv[2];
if (!settingsPath) {
  process.stderr.write("Usage: mcp-bridge.js <path to VNami settings.json>\n");
  process.exit(2);
}
void runBridge({ input: process.stdin, output: process.stdout, endpoint: () => endpointFromSettings(settingsPath) }).then(() =>
  process.exit(0),
);
