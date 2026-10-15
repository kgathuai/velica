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

// Trusting the CA on this Mac needs sudo, which cannot prompt from a script.
// That is not fatal: the phone only needs the rootCA.pem file itself.
try {
  console.log("Trusting the local certificate authority on this Mac…");
  execFileSync("mkcert", ["-install"], { stdio: "inherit" });
} catch {
  console.warn(
    "\n! Could not trust the certificate on this Mac — that step needs your password.",
  );
  console.warn("  The phone does not need it. To also use the app from this Mac, run:");
  console.warn("\n    mkcert -install\n");
}

try {
  console.log(`Issuing a certificate for: ${hosts.join(", ")}`);
  execFileSync("mkcert", ["-key-file", keyFile, "-cert-file", certFile, ...hosts], {
    stdio: "inherit",
  });
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
    `\nSend this file to your phone and trust it there:\n  ${path.join(caRoot, "rootCA.pem")}`,
  );
  console.log("  iOS:     Settings > Profile Downloaded > Install, then Settings > General >");
  console.log("           About > Certificate Trust Settings > enable full trust for mkcert.");
  console.log("  Android: Settings > Security > Encryption & credentials > Install a certificate.");
} catch {
  // Not fatal — the path can be printed with `mkcert -CAROOT` manually.
}

console.log("\nStart the server with:\n\n  npm run dev:https\n");
for (const address of addresses) {
  console.log(`Then open on your phone:  https://${address}:3443`);
}
