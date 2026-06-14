import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runMigrateDeploy() {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  if (runMigrateDeploy()) {
    process.exit(0);
  }

  if (attempt < MAX_ATTEMPTS) {
    console.warn(
      `prisma migrate deploy failed (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${RETRY_DELAY_MS / 1000}s…`,
    );
    await sleep(RETRY_DELAY_MS);
  }
}

console.error("prisma migrate deploy failed after all retries.");
process.exit(1);
