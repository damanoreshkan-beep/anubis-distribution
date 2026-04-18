/**
 * Generates the Forge ForgeHosted module (+ its Library subModules) for
 * distribution.json from a Forge installer jar.
 *
 * Why this script exists:
 *   Helios launches Forge via ForgeHosted, whose spec requires every library
 *   declared in Forge's version.json to be present as a subModule with size
 *   and MD5. version.json ships SHA1 only — we must download each library
 *   and compute MD5 ourselves. The Forge universal jar itself has no public
 *   URL (it lives inside the installer), so we extract it from the installer
 *   and upload to our GitHub Release as the primary artifact.
 *
 * Inputs  (hardcoded, Phase 6):
 *   work/forge-installer.jar   - the Forge 1.12.2-14.23.5.2860 installer
 *
 * Outputs:
 *   work/version.json          - extracted from installer
 *   work/install_profile.json  - extracted from installer
 *   work/forge-universal.jar   - Forge code jar (extract target for upload)
 *   docs/forge-module.json     - ready-to-splice Helios ForgeHosted module
 *
 * Run once per Forge version bump:
 *   node scripts/build-forge-submodules.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT            = path.resolve(__dirname, '..');
const INSTALLER_PATH  = path.join(ROOT, 'work', 'forge-installer.jar');
const VERSION_JSON    = path.join(ROOT, 'work', 'version.json');
const UNIVERSAL_JAR   = path.join(ROOT, 'work', 'forge-universal.jar');
const OUT_MODULE_JSON = path.join(ROOT, 'docs', 'forge-module.json');

const REPO_OWNER  = 'damanoreshkan-beep';
const REPO_NAME   = 'anubis-distribution';
const RELEASE_TAG = 'v1.0.0';
const RELEASE_BASE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${RELEASE_TAG}`;

if (!fs.existsSync(INSTALLER_PATH)) {
    console.error(`Forge installer not found at ${INSTALLER_PATH}`);
    process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────
// Extract version.json, install_profile.json, and the bundled Forge jar.
// ──────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(VERSION_JSON)) {
    execFileSync('unzip', ['-o', '-j', INSTALLER_PATH, 'version.json', 'install_profile.json', '-d', path.dirname(VERSION_JSON)]);
}
if (!fs.existsSync(UNIVERSAL_JAR)) {
    const tmp = path.join(ROOT, 'work', 'forge-maven-tmp');
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('unzip', ['-o', '-j', INSTALLER_PATH, 'maven/net/minecraftforge/forge/*/forge-*.jar', '-d', tmp]);
    const jars = fs.readdirSync(tmp).filter(f => /forge-.*\.jar$/.test(f));
    if (jars.length !== 1) throw new Error(`Expected exactly one Forge jar in installer, got ${jars.length}`);
    fs.renameSync(path.join(tmp, jars[0]), UNIVERSAL_JAR);
    fs.rmdirSync(tmp);
}

const version = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8'));
const FORGE_ID = version.id; // e.g. "1.12.2-forge-14.23.5.2860"
const FORGE_VERSION = FORGE_ID.replace('-forge-', '-');
const FORGE_UNIVERSAL_NAME = `forge-${FORGE_VERSION}.jar`;

// ──────────────────────────────────────────────────────────────────────────
// Download each remote library, compute MD5.
// ──────────────────────────────────────────────────────────────────────────
async function downloadAndHash(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
        size: buf.length,
        MD5: crypto.createHash('md5').update(buf).digest('hex')
    };
}

(async () => {
    const subModules = [];

    // VersionManifest subModule — Helios needs the Forge version.json hosted
    // separately (launch args, mainClass, tweakers live there). Without it the
    // launch fails with "No mod loader version manifest module found!".
    const versionManifestName = `${FORGE_ID}.json`;
    const versionJsonBuf = fs.readFileSync(VERSION_JSON);
    const versionJsonMD5 = crypto.createHash('md5').update(versionJsonBuf).digest('hex');
    subModules.push({
        id: FORGE_ID,
        name: `Minecraft Forge (version manifest)`,
        type: 'VersionManifest',
        artifact: {
            size: versionJsonBuf.length,
            MD5: versionJsonMD5,
            url: `${RELEASE_BASE}/${versionManifestName}`
        }
    });
    console.log(`  MANIFEST ${FORGE_ID}.json  ${versionJsonBuf.length}B  md5=${versionJsonMD5.slice(0, 8)}...`);

    for (const lib of version.libraries) {
        const art = lib.downloads && lib.downloads.artifact;
        if (!art) {
            console.warn(`  SKIP no artifact: ${lib.name}`);
            continue;
        }

        if (lib.name === `net.minecraftforge:forge:${FORGE_VERSION}`) {
            // Forge universal — file is local; we upload it to the Release.
            const buf = fs.readFileSync(UNIVERSAL_JAR);
            const md5 = crypto.createHash('md5').update(buf).digest('hex');
            console.log(`  FORGE  ${lib.name}  ${buf.length}B  md5=${md5}`);
            continue; // parent ForgeHosted artifact is the universal jar itself
        }

        if (!art.url) {
            console.warn(`  SKIP no URL: ${lib.name}`);
            continue;
        }

        process.stdout.write(`  fetch ${lib.name} ... `);
        try {
            const { size, MD5 } = await downloadAndHash(art.url);
            console.log(`${size}B  md5=${MD5.slice(0, 8)}...`);
            subModules.push({
                id: lib.name,
                name: lib.name,
                type: 'Library',
                artifact: { size, MD5, url: art.url }
            });
        } catch (e) {
            console.log(`ERROR ${e.message}`);
            throw e;
        }
    }

    // Forge universal jar is the parent artifact of ForgeHosted.
    const universalBuf = fs.readFileSync(UNIVERSAL_JAR);
    const universalMD5 = crypto.createHash('md5').update(universalBuf).digest('hex');

    const forgeModule = {
        id: `net.minecraftforge:forge:${FORGE_VERSION}`,
        name: `Minecraft Forge ${FORGE_VERSION}`,
        type: 'ForgeHosted',
        artifact: {
            size: universalBuf.length,
            MD5: universalMD5,
            url: `${RELEASE_BASE}/${FORGE_UNIVERSAL_NAME}`
        },
        subModules
    };

    fs.mkdirSync(path.dirname(OUT_MODULE_JSON), { recursive: true });
    fs.writeFileSync(OUT_MODULE_JSON, JSON.stringify(forgeModule, null, 2));

    console.log(`\nWrote: ${OUT_MODULE_JSON}`);
    console.log(`  Forge universal:  ${universalBuf.length}B  md5=${universalMD5}`);
    console.log(`  Upload to release: gh release upload ${RELEASE_TAG} work/forge-universal.jar --clobber`);
    console.log(`  Rename target:    ${FORGE_UNIVERSAL_NAME}`);
    console.log(`  Total subModules: ${subModules.length}`);
})();
