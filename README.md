# Anubis World — Distribution

Helios-feed модпаку **HiTech** (Minecraft 1.20.1, Forge 47.4.10, Java 17).

Лаунчер тягне `docs/distribution.json` з GitHub Pages, бінарники — з Releases.

- Feed: https://damanoreshkan-beep.github.io/anubis-distribution/distribution.json
- Assets: https://github.com/damanoreshkan-beep/anubis-distribution/releases/tag/v1.0.0

## Як додати мод

**Серверний** — кидаєш jar у `/mods/` на ігровому сервері (SFTP). Daily cron підбере; вручну — Actions → `sync mods from server` → Run.

**Клієнт-онлі** (OptiFine, FancyMenu, skin loaders) — кидаєш jar у `client-mods/` цього репо, `git push`. Решту робить workflow.

Видалив файл → запис автоматично прибирається з feed.

## Структура

```
docs/
  distribution.json    Helios feed — auto-generated, не редагувати
  forge-module.json    Forge installer manifest
  servers.dat          pre-loaded server entry
client-mods/           клієнт-онлі jar'и (git-tracked)
config/                mod-config'и (git-tracked)
scripts/               sync + build pipeline
```

## Workflows

| Файл | Тригер | Що робить |
|------|--------|-----------|
| `sync.yml` | cron 04:17 UTC, push до `scripts/client-*.json`, manual | SFTP pull → upload diff у Release → regen `distribution.json` |
| `client-mods.yml` | push до `client-mods/**` | upload у Release → regen `client-extras.json` → тригер `sync.yml` |

## Апгрейд Forge

```bash
node scripts/generate-forge-module.mjs <mc> <forge>
# оновити FORGE_VERSION / MC_VERSION у scripts/build-distribution.js
npm run sync
```

Forge 1.13+: `installClient` крок виконує лаунчер при першому запуску.
