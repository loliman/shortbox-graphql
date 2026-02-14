const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const command = process.argv[2] || "codegen";
const projectRoot = path.resolve(__dirname, "..");

function loadContractDependencyPath() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
    );
    const dependency = packageJson.dependencies?.["@shortbox/contract"];
    if (typeof dependency === "string" && dependency.startsWith("file:")) {
      return dependency.slice("file:".length);
    }
  } catch {
    // Ignore parse/read errors and fall back to defaults.
  }

  return null;
}

function resolveContractDirectory() {
  const candidates = [];
  if (process.env.SHORTBOX_CONTRACT_DIR) {
    candidates.push(process.env.SHORTBOX_CONTRACT_DIR);
  }

  const dependencyPath = loadContractDependencyPath();
  if (dependencyPath) {
    candidates.push(dependencyPath);
  }

  candidates.push("../shortbox-contract");

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    const resolved = path.resolve(projectRoot, candidate);
    if (fs.existsSync(path.join(resolved, "package.json"))) return resolved;
  }

  return null;
}

const contractDirectory = resolveContractDirectory();
if (!contractDirectory) {
  console.warn(
    `Konnte shortbox-contract nicht finden. Überspringe npm run ${command}. ` +
      "Setze SHORTBOX_CONTRACT_DIR auf den Pfad zum Contract-Repo, um Codegen auszuführen."
  );
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", command], {
  cwd: contractDirectory,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
