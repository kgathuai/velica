#!/usr/bin/env node
/**
 * Issues a locally trusted HTTPS certificate covering this Mac's LAN address, so the
 * camera works when the app is opened from a phone.
 *
 *   brew install mkcert
 *   npm run certs
 *   npm run dev:https
 *
 * Nothing leaves your network: mkcert creates its own local certificate authority.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";

const directory = path.join(process.cwd(), "certs");
const keyFile = path.join(directory, "dev-key.pem");
const certFile = path.join(directory, "dev-cert.pem");

const addresses = [];
for (const entries of Object.values(networkInterfaces())) {
  for (const entry of entries ?? []) {
    if (entry.family === "IPv4" && !entry.internal) {
      addresses.push(entry.address);
    }
  }
}

if (addresses.length === 0) {
  console.error("No LAN address found — connect this Mac to the same Wi-Fi as your phone.");
  process.exit(1);
}

const hosts = [...addresses, "localhost", "127.0.0.1"];

mkdirSync(directory, { recursive: true });

try {
  console.log("Installing the local certificate authority (only needs doing once)…");
  execFileSync("mkcert", ["-install"], { stdio: "inherit" });

  console.log(`\nIssuing a certificate for: ${hosts.join(", ")}`);
  execFileSync(
    "mkcert",
    ["-key-file", keyFile, "-cert-file", certFile, ...hosts],
    { stdio: "inherit" },
  );
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.error("\nmkcert is not installed. Install it first:\n\n  brew install mkcert\n");
  } else {
    console.error("\nmkcert failed — see the output above.");
  }
  process.exit(1);
}

console.log(`\nCertificate written to ${certFile}`);

try {
  const caRoot = execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
  console.log(
    `\nTo trust it on your phone, send this file over:\n  ${path.join(caRoot, "rootCA.pem")}`,
  );
} catch {
  // Not fatal — the path can be printed with `mkcert -CAROOT` manually.
}

console.log("\nStart the server with:\n\n  npm run dev:https\n");
for (const address of addresses) {
  console.log(`Then open on your phone:  https://${address}:3000`);
}
