const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const pathKey =
  Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
const currentPath = process.env[pathKey] || "";

if (!currentPath.toLowerCase().includes(cargoBin.toLowerCase())) {
  process.env[pathKey] = `${cargoBin}${path.delimiter}${currentPath}`;
}

const tauriBin = path.join(
  __dirname,
  "..",
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js"
);

const args = process.argv.slice(2);
const child = spawn(process.execPath, [tauriBin, ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

