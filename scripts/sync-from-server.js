// Pull the canonical mod set from the live game server, materialise it under
// `mods/`, sync any new/changed jars into the GitHub Release, and regenerate
// `docs/distribution.json` so clients see what the server actually runs.
//
// Source of truth: SFTP /mods on the game server.
// Destination: this repo's mods/ + GitHub Release v1.0.0 + docs/distribution.json.
//
// Reads SFTP target + creds from env (set via GitHub Actions Secrets in CI,
// exported in shell for local runs):
//   SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASS
//
// Tunables:
//   scripts/client-extras.json — basenames the client needs but the server
//     does NOT host (OptiFine, skincape, etc). Their jars are downloaded from
//     the existing Release so build-distribution.js can MD5 them locally.
//   scripts/client-skip.json — basenames present on the server but the
//     client must NOT receive (server-only utilities). Empty by default.
//
// Filename normalisation: filenames with spaces or `(N)` Windows-duplicate
// suffixes are renamed during pull (sanitized in-memory only — we never
// write back to the live server). The on-disk copy in mods/ uses the
// sanitized name and that's what the GitHub Release asset is named.

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { execSync } = require('child_process')
const Client = require('ssh2-sftp-client')

const ROOT = path.resolve(__dirname, '..')
const MODS_DIR = path.join(ROOT, 'mods')
const EXTRAS_FILE = path.join(__dirname, 'client-extras.json')
const SKIP_FILE = path.join(__dirname, 'client-skip.json')

const RELEASE_TAG = 'v1.0.0'
const REPO = 'damanoreshkan-beep/anubis-distribution'

const REQUIRED_ENV = ['SFTP_HOST', 'SFTP_PORT', 'SFTP_USER', 'SFTP_PASS']
for (const k of REQUIRED_ENV) {
    if (!process.env[k]) {
        console.error(`missing env: ${k}`)
        process.exit(1)
    }
}

// Sanitize a server-side filename for client distribution. The live server
// happily runs files with spaces / parens, but Helios fetches over HTTP and
// downstream URL encoding gets brittle with weird characters — also the
// existing Release was uploaded with sanitized names, so we keep the same
// scheme and avoid renaming half the assets.
function sanitize(name) {
    return name
        .replace(/\s+\(\d+\)\.(jar|zip)$/i, '.$1')   // "foo (1).jar" → "foo.jar" (Windows download dupe)
        .replace(/^\[([\d.]+)\]/, '_$1_')            // "[1.12.2]X.jar" → "_1.12.2_X.jar"
        .replace(/\s+/g, '_')                        // remaining spaces → underscores
}

// Recurse SFTP /mods, return Map<basename, { size, remotePath }>.
async function scanServerMods(sftp) {
    const out = new Map()
    async function walk(dir) {
        const list = await sftp.list(dir)
        for (const e of list) {
            const remotePath = `${dir}/${e.name}`
            if (e.type === '-' && /\.(jar|zip)$/i.test(e.name)) {
                const basename = sanitize(e.name)
                out.set(basename, { size: e.size, remotePath })
            } else if (e.type === 'd') {
                // Skip Forge runtime caches / non-mod folders.
                if (['memory_repo', 'cache', 'tmp'].includes(e.name)) continue
                await walk(remotePath).catch(() => {})
            }
        }
    }
    await walk('/mods')
    return out
}

async function downloadFromServer(sftp, remotePath, localPath) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true })
    await sftp.fastGet(remotePath, localPath)
}

async function downloadFromRelease(basename, localPath) {
    // The asset URL is deterministic for our public Release. Stream-write so
    // we don't buffer entire jars (some are 8+ MB).
    const url = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${encodeURIComponent(basename)}`
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${basename}`)
    await fsp.mkdir(path.dirname(localPath), { recursive: true })
    const { Readable } = require('stream')
    const { pipeline } = require('stream/promises')
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(localPath))
}

function listReleaseAssets() {
    // gh CLI is the simplest way to list assets without juggling pagination.
    const json = execSync(`gh release view ${RELEASE_TAG} -R ${REPO} --json assets`, { encoding: 'utf8' })
    return new Map(JSON.parse(json).assets.map(a => [a.name, a]))
}

function uploadAsset(localPath) {
    // --clobber overwrites if the asset name already exists (handles updated
    // mod versions where the basename stays the same — e.g. JEI bumps).
    execSync(`gh release upload ${RELEASE_TAG} -R ${REPO} --clobber "${localPath}"`, { stdio: 'inherit' })
}

;(async () => {
    const sftp = new Client()
    await sftp.connect({
        host: process.env.SFTP_HOST,
        port: Number(process.env.SFTP_PORT),
        username: process.env.SFTP_USER,
        password: process.env.SFTP_PASS,
        readyTimeout: 30000,
    })
    console.log(`connected: ${process.env.SFTP_HOST}:${process.env.SFTP_PORT}`)

    let serverMods
    try {
        serverMods = await scanServerMods(sftp)
        console.log(`server /mods: ${serverMods.size} jars`)
    } finally {
        // Disconnect ASAP so we don't hold the SFTP slot during slow uploads.
        await sftp.end()
    }

    const skip = new Set(JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8')))
    const extras = JSON.parse(fs.readFileSync(EXTRAS_FILE, 'utf8'))

    // Wipe local mods/ so removed-on-server mods drop out of distribution
    // automatically. Local mods/ is ephemeral working state — gitignored,
    // recomputed each sync. Don't blow away nested non-mod stuff just in case.
    if (fs.existsSync(MODS_DIR)) {
        await fsp.rm(MODS_DIR, { recursive: true, force: true })
    }
    await fsp.mkdir(MODS_DIR, { recursive: true })

    // Reconnect for the actual file pull (we ended() above to release slot
    // during the listing-only phase; reopen for downloads).
    const sftp2 = new Client()
    await sftp2.connect({
        host: process.env.SFTP_HOST,
        port: Number(process.env.SFTP_PORT),
        username: process.env.SFTP_USER,
        password: process.env.SFTP_PASS,
        readyTimeout: 30000,
    })
    try {
        let pulled = 0
        for (const [basename, { remotePath }] of serverMods) {
            if (skip.has(basename)) {
                console.log(`  SKIP (client-skip): ${basename}`)
                continue
            }
            const localPath = path.join(MODS_DIR, basename)
            await downloadFromServer(sftp2, remotePath, localPath)
            pulled++
        }
        console.log(`pulled ${pulled} jars from server`)
    } finally {
        await sftp2.end()
    }

    // Merge client-only extras pulled from the existing Release.
    for (const basename of extras) {
        const localPath = path.join(MODS_DIR, basename)
        if (fs.existsSync(localPath)) continue   // server already shipped this name
        try {
            await downloadFromRelease(basename, localPath)
            console.log(`  +EXTRA from Release: ${basename}`)
        } catch (e) {
            console.error(`  FAILED extra ${basename}: ${e.message}`)
            process.exitCode = 1
        }
    }

    // Diff with the live Release: upload anything new or changed (size diff
    // is a good-enough proxy — gh release upload clobbers on name match so
    // updated jars overwrite). Do this BEFORE regenerating distribution.json
    // so the URLs in the feed are guaranteed to resolve.
    const releaseAssets = listReleaseAssets()
    const localFiles = fs.readdirSync(MODS_DIR)
    let uploaded = 0
    for (const name of localFiles) {
        const localPath = path.join(MODS_DIR, name)
        const stat = fs.statSync(localPath)
        if (stat.isDirectory()) continue
        const existing = releaseAssets.get(name)
        if (existing && existing.size === stat.size) continue
        console.log(`  UPLOAD: ${name} (${stat.size} bytes)`)
        uploadAsset(localPath)
        uploaded++
    }
    console.log(`uploaded ${uploaded} assets to Release ${RELEASE_TAG}`)

    // Regenerate distribution.json from the freshly-materialised mods/.
    require('./build-distribution.js')

    console.log('sync complete.')
})().catch(err => {
    console.error('FATAL:', err)
    process.exit(1)
})
