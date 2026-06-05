// Post-build step: stamp the just-built version into
// dist-dashlab/latest-version.json so the auto-updater on the other machine can
// compare it against its running app.getVersion() and offer the new installer.
// Run by the `pack:mac` / `pack:win` npm scripts after electron-builder.

const fs = require("fs");
const path = require("path");

// require() resolves relative to THIS file (scripts/), so reach up one level to
// the project root for package.json.
const { version } = require(path.join(__dirname, "..", "package.json"));

const outPath = path.join(__dirname, "..", "dist-dashlab", "latest-version.json");
fs.writeFileSync(outPath, JSON.stringify({ version }, null, 2));
console.log("Wrote latest-version.json:", version);
