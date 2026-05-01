// Generates the Minecraft `servers.dat` NBT file pre-populated with the
// Anubis World server entry. Helios drops this into instance root before
// the JVM launches, so the player sees the server in the Multiplayer list
// out of the box (no manual "Add Server" / "Direct Connect" step).
//
// servers.dat format (Minecraft 1.12.2): uncompressed NBT, Big-Endian.
//   TAG_Compound ""
//     TAG_List "servers" of TAG_Compound
//       { name: "...", ip: "...", icon?: base64 PNG, acceptTextures?: byte }

const fs = require('fs')
const path = require('path')
const nbt = require('prismarine-nbt')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'servers.dat')
const ICON_PATH = path.join(ROOT, 'docs', 'server-icon.jpg')

function tryReadIconAsBase64Png(){
    if(!fs.existsSync(ICON_PATH)) return undefined
    // Minecraft expects the icon as a base64 PNG (without data URI prefix).
    // We ship a JPEG; convert via ImageMagick if available, otherwise skip.
    try {
        const tmp = ICON_PATH.replace(/\.jpg$/i, '.tmp.png')
        require('child_process').execFileSync('magick', [
            ICON_PATH, '-resize', '64x64!', tmp,
        ], { stdio: 'ignore' })
        const png = fs.readFileSync(tmp)
        fs.unlinkSync(tmp)
        return png.toString('base64')
    } catch (e){
        console.warn('Skipping server icon (magick not available or conversion failed):', e?.message)
        return undefined
    }
}

const iconB64 = tryReadIconAsBase64Png()

const serverEntry = {
    name: nbt.string('Anubis World — HiTech'),
    ip:   nbt.string('94.100.18.18:50273'),
    acceptTextures: nbt.byte(1),
}
if(iconB64){
    serverEntry.icon = nbt.string(iconB64)
}

const root = {
    type: 'compound',
    name: '',
    value: {
        servers: nbt.list(nbt.comp([serverEntry])),
    },
}

const buf = nbt.writeUncompressed(root, 'big')
fs.writeFileSync(OUT, buf)
console.log(`Generated: ${OUT} (${buf.length} bytes)`)
