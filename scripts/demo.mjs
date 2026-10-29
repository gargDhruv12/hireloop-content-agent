// Starts the app in offline sample mode (no API key needed). Works on Windows, macOS and Linux.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, MOCK_AI: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
