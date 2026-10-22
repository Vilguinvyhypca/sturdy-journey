/* eslint-disable @typescript-eslint/no-require-imports -- Shared by native Node maintenance commands and compiled app modules. */
const { spawn } = require("node:child_process");
const { mkdir, open } = require("node:fs/promises");
const { join } = require("node:path");

// Linux flock locks the shared open-file description inherited on descriptor 3.
// Once flock exits, this process's descriptor retains the lock until close/crash.
// Never unlink the lock file: another inode would allow concurrent writers.
async function withCatalogLock(directory, operation, timeoutSeconds = 10) {
  await mkdir(directory, { recursive: true });
  const file = await open(join(directory, ".catalog-write.lock"), "a", 0o600);
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn("flock", ["--exclusive", "--timeout", String(timeoutSeconds), "3"],
        { stdio: ["ignore", "ignore", "ignore", file.fd] });
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (code !== 0) throw Object.assign(new Error("Catalog is busy. Retry after the other writer finishes."), { code: "CATALOG_BUSY" });
    return await operation();
  } finally {
    await file.close();
  }
}

module.exports = { withCatalogLock };
