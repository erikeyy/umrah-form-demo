const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = "production";
process.env.HOSTNAME = process.env.NEXT_HOSTNAME || "127.0.0.1";

const standaloneServer = path.join(__dirname, ".next", "standalone", "server.js");

if (!fs.existsSync(standaloneServer)) {
  console.error("Standalone server tidak ditemukan. Jalankan `npm run build` sebelum start.");
  process.exit(1);
}

require(standaloneServer);
