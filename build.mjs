// build.mjs — empacota src/ + package.json em dist.zip
// uso: node build.mjs — sem dependências externas

import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(ROOT, "dist.zip");

if (existsSync(DIST)) {
  rmSync(DIST);
  console.log("🗑  Removido dist.zip anterior");
}

console.log("🔨 Gerando dist.zip...");

if (process.platform === "win32") {
  // PowerShell nativo do Windows
  execSync(
    `powershell -Command "Compress-Archive -Path 'src', 'package.json' -DestinationPath 'dist.zip'"`,
    { cwd: ROOT, stdio: "inherit" }
  );
} else {
  // Linux / Mac
  execSync("zip -r dist.zip src/ package.json", { cwd: ROOT, stdio: "inherit" });
}

console.log("✅ dist.zip gerado com sucesso!");
