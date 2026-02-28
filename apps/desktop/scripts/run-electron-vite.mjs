import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "preview") {
  console.error('[run-electron-vite] Usage: node ./scripts/run-electron-vite.mjs <dev|preview>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const ensureScript = path.join(scriptDir, "ensure-electron.mjs");
const electronViteCli = path.join(appRoot, "node_modules", "electron-vite", "bin", "electron-vite.js");

const env = { ...process.env };
if (env.ELECTRON_RUN_AS_NODE) {
  console.log("[run-electron-vite] Clearing ELECTRON_RUN_AS_NODE for Electron runtime.");
  delete env.ELECTRON_RUN_AS_NODE;
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: appRoot,
    env,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`[run-electron-vite] Failed to run ${scriptPath}:`, result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

runNodeScript(ensureScript);
runNodeScript(electronViteCli, [mode]);
