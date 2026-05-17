// Generates docs/forge-module.json for a Forge version on Minecraft 1.13+.
//
// Forge from 1.13 onwards ships a non-trivial installer (BootstrapLauncher
// chain, cpw.mods.securejarhandler, etc.). helios-core 2.3.0 does NOT
// auto-resolve those libraries from the Forge version manifest — it only
// reads the manifest's JSON. So every library the launch JVM needs must
// be listed in distribution.json as a `Library`-typed sub-module pointing
// at its Maven URL.
//
// Usage:
//   node scripts/generate-forge-module.mjs 1.20.1 47.4.10
//
// Pre-condition: forge-1.20.1-47.4.10-installer.jar and forge-version.json
// already uploaded to the v1.0.0 GitHub Release. (Their MD5/size are
// re-checked here against the local files in /tmp/.)
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const [mcVersion, forgeVer] = process.argv.slice(2)
if (!mcVersion || !forgeVer) {
    console.error('usage: generate-forge-module.mjs <mcVersion> <forgeVer>')
    process.exit(1)
}

const FORGE_ID = `${mcVersion}-${forgeVer}`
const ROOT = path.resolve(import.meta.dirname, '..')
const VERSION_JSON = path.join(ROOT, 'docs', 'forge-version.local.json')

// Pull the Forge installer's version.json. It lives inside the installer
// jar, but we already extracted it to /tmp during the v1.20.1 migration —
// or we can re-extract now if it's not there.
let versionJson
if (fs.existsSync('/tmp/forge-version.json')) {
    versionJson = JSON.parse(fs.readFileSync('/tmp/forge-version.json', 'utf8'))
} else {
    console.error('Expected /tmp/forge-version.json (extracted from the installer)')
    process.exit(2)
}

const RELEASE_BASE = `https://github.com/damanoreshkan-beep/anubis-distribution/releases/download/v1.0.0`
const installerJar = `/tmp/forge-${FORGE_ID}-installer.jar`
const installerSize = fs.statSync(installerJar).size
const installerMd5 = md5(fs.readFileSync(installerJar))
const versionJsonSize = fs.statSync('/tmp/forge-version.json').size
const versionJsonMd5 = md5(fs.readFileSync('/tmp/forge-version.json'))

function md5(buf) { return createHash('md5').update(buf).digest('hex') }

// Convert "group:artifact:version" → "group/artifact/version/artifact-version.jar"
function mavenPath(name) {
    const [grp, art, ver] = name.split(':')
    return `${grp.replaceAll('.', '/')}/${art}/${ver}/${art}-${ver}.jar`
}

console.log(`Resolving ${versionJson.libraries.length} libraries…`)

const subModules = [
    {
        id: FORGE_ID,
        name: 'Minecraft Forge (version manifest)',
        type: 'VersionManifest',
        artifact: {
            size: versionJsonSize,
            MD5: versionJsonMd5,
            url: `${RELEASE_BASE}/forge-version.json`,
        },
    },
]

for (const lib of versionJson.libraries) {
    const a = lib.downloads?.artifact
    if (!a?.url) { console.warn('skip (no url):', lib.name); continue }

    process.stdout.write(`  ${lib.name}… `)
    const r = await fetch(a.url)
    if (!r.ok) { console.warn(`HTTP ${r.status} — skip`); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    const size = a.size ?? buf.length
    const m = md5(buf)
    console.log(`${size}B, MD5 ${m.slice(0, 8)}…`)

    subModules.push({
        id: lib.name,
        name: lib.name,
        type: 'Library',
        artifact: {
            size,
            MD5: m,
            url: a.url,
        },
    })
}

const forgeModule = {
    id: `net.minecraftforge:forge:${FORGE_ID}`,
    name: `Minecraft Forge ${FORGE_ID}`,
    type: 'ForgeHosted',
    artifact: {
        size: installerSize,
        MD5: installerMd5,
        url: `${RELEASE_BASE}/forge-${FORGE_ID}-installer.jar`,
    },
    subModules,
}

const out = path.join(ROOT, 'docs', 'forge-module.json')
fs.writeFileSync(out, JSON.stringify(forgeModule, null, 2) + '\n')
console.log(`Wrote ${out} (${subModules.length} sub-modules including manifest)`)
