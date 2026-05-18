# Anubis World — Distribution

Helios-формат feed для модпакa **HiTech** (Minecraft 1.20.1 + Forge 47.4.10, Java 17). Лаунчер `anubis-launcher` читає `docs/distribution.json` через GitHub Pages і завантажує файли з GitHub Release.

> **Source of truth — живий ігровий сервер.** `mods/` локально + GitHub Release v1.0.0 — це derivative, синхронізуються автоматично з SFTP.

## Live URLs

- Feed: https://damanoreshkan-beep.github.io/anubis-distribution/distribution.json
- Mods/shaderpacks/resourcepacks (binary assets): https://github.com/damanoreshkan-beep/anubis-distribution/releases/tag/v1.0.0
- Configs (text, git-tracked): обслуговуються через `raw.githubusercontent.com`
- Сервер: `46.21.146.194:50468`

## Як додати/оновити мод

Є два канали — залежно від того, серверний це мод чи клієнт-онлі.

### A. Серверний мод (синкається автоматично з SFTP)

1. Завантажуєш jar в `/mods/` на сервері (через панель Pterodactyl або SFTP-клієнт)
2. Чекаєш до **04:17 UTC наступного дня** (auto-cron) — або тригериш вручну:
   - GitHub repo → **Actions** → **sync mods from server** → **Run workflow**
3. Через ~1.5 хв `distribution.json` оновлено, нові jar'и в Release як assets — клієнти бачать їх при наступному запуску лаунчера

Видалив мод з сервера → workflow прибере його з feed автоматично. Старі assets лишаються в Release як orphans (нешкідливо).

### B. Клієнт-онлі мод (нема на сервері)

Для модів, які мають жити лише в клієнта (skin loaders, FancyMenu, OptiFine тощо):

1. Кидаєш jar в директорію **`client-mods/`** у цьому репо
2. `git add client-mods/ && git commit -m "add <mod>" && git push`
3. Workflow `client-mods upload + regen` сам:
   - заливає всі `.jar` з `client-mods/` у v1.0.0 Release (`gh release upload --clobber`)
   - регенерить `scripts/client-extras.json` зі списку файлів у директорії
   - тригерить `sync.yml` → той перебудовує `docs/distribution.json`
4. ~30 секунд пізніше нові моди вже у feed

Видалив jar з `client-mods/`, запушив → запис автоматично прибирається з `client-extras.json` (orphan asset у Release лишається).

## Архітектура

```
   ┌──────────────────────┐                ┌────────────────────────┐
   │  Game server         │                │  GitHub Release v1.0.0 │
   │  /mods/*.jar  (SFTP) │   ──sync──→    │  + assets              │
   └─────────┬────────────┘                └────────────┬───────────┘
             │                                          ↑
             │ canonical                                │
             │                              ┌───────────┴────────────┐
             │                              │  client-mods/*.jar     │
             │                              │  (git-tracked)         │
             │                              └────────────────────────┘
             │                                          │
             │                              ┌────────────────────────┐
             │                              │  docs/distribution.json│
             │                              │  (GitHub Pages CDN)    │
             └─────── auto-regenerate ─────→└────────────┬───────────┘
                                                          │
                                              ┌───────────▼───────────┐
                                              │  anubis-launcher       │
                                              │  (Helios fork)         │
                                              └───────────────────────┘
```

## Вміст репо

| Шлях | Що |
|------|----|
| `docs/distribution.json` | Helios feed (auto-generated). Не редагувати руками. |
| `docs/forge-module.json` | Forge installer manifest: 1 VersionManifest + 29 Library subModules для 1.20.1-47.4.10. Згенерований `scripts/generate-forge-module.mjs`. |
| `docs/servers.dat` | NBT з pre-loaded server entry. Згенерований `scripts/generate-servers-dat.js`. |
| `docs/server-icon.jpg` | 1024×1024 ікона в server list. |
| `client-mods/` | Клієнт-онлі jar'и (CSL, FancyMenu тощо). Git-tracked. Workflow `client-mods.yml` на push заливає в Release + регенерить `scripts/client-extras.json`. |
| `config/` | Кастомні mod-config'и (CustomSkinLoader endpoint, FTB Quests, Xaero тощо). Git-tracked, серверні через raw.githubusercontent. |
| `client-overlays/` | Per-mod overlay-файли для клієнта (texturepacks, lang overrides) — складаються поверх unpacked мода. |
| `mods/`, `shaderpacks/`, `resourcepacks/` | gitignored, ефемерні. `npm run sync` створює locally; в Release живуть як assets. |
| `scripts/sync-from-server.js` | SFTP pull → upload до Release → regenerate feed |
| `scripts/build-distribution.js` | Сканує локальні `mods/`/`config/`/тощо → пише `docs/distribution.json`. `FORGE_VERSION = '1.20.1-47.4.10'`, `MC_VERSION = '1.20.1'`. |
| `scripts/generate-forge-module.mjs` | Витягує Forge installer (`<mc>-<forge>-installer.jar`), enumerує його libraries → пише `docs/forge-module.json` зі стабільними Maven-URL. Запускається при апгрейді Forge: `node scripts/generate-forge-module.mjs 1.20.1 47.4.10` |
| `scripts/build-forge-submodules.js` | (Legacy для 1.12.2 ForgeGradle 2.) Не використовується для 1.20.1 — `generate-forge-module.mjs` його замінив. |
| `scripts/generate-servers-dat.js` | NBT-encode для `servers.dat` |
| `scripts/client-extras.json` | Список jar'ів які треба клієнту АЛЕ нема на сервері. **Auto-generated workflow'ом `client-mods.yml`** із вмісту `client-mods/`. |
| `scripts/client-skip.json` | Список jar'ів на сервері які НЕ йдуть клієнту (наприклад `CustomSkinLoader_ForgeV1-14.28.jar` — стара версія, несумісна з 1.20.1). |
| `.github/workflows/sync.yml` | Daily cron `17 4 * * *` UTC + workflow_dispatch. Тригериться також при змінах `scripts/client-extras.json` чи `client-skip.json`. |
| `.github/workflows/client-mods.yml` | Push до `client-mods/**` → upload в Release + regen `client-extras.json` + тригер `sync.yml`. |

## Ручний sync (з dev машини)

```bash
export SFTP_HOST=... SFTP_PORT=... SFTP_USER=... SFTP_PASS=...
npm ci
npm run sync          # SFTP pull → upload зміни в Release → regen feed
git diff docs/distribution.json   # перевір що змінилось
git commit -am "..." && git push   # коміт лише якщо хочеш зафіксити drift
```

В CI всі 4 змінні — GitHub Secrets `SFTP_HOST` / `SFTP_PORT` / `SFTP_USER` / `SFTP_PASS`. Ніде в plaintext не зберігаються.

## Версіонування

- Тег `v1.0.0` Release використовується як stable bucket для assets — sync клобберить існуючі (`gh release upload --clobber`), тож URL'и стабільні.
- Якщо колись потрібен hard cutover на нову мажорну версію Forge / Minecraft — створити v2.0.0 Release і оновити `RELEASE_TAG` у `sync-from-server.js` + `build-distribution.js`.

## Апгрейд Forge

```bash
# 1. Згенерувати новий forge-module.json з Maven libraries
node scripts/generate-forge-module.mjs 1.20.1 47.4.10

# 2. Оновити константи в scripts/build-distribution.js
#    FORGE_VERSION = '1.20.1-47.4.10'
#    MC_VERSION = '1.20.1'
#    javaOptions.suggestedMajor / supported

# 3. Запустити sync — він підхопить новий forge-module.json у feed
npm run sync
```

Forge 1.13+ потребує `installClient` step на клієнті (генерує `client-srg.jar`, `client-extra.jar`, fmlcore тощо). Лаунчер виконує його headless при першому запуску — див. `ensureForgeClientArtifacts()` в `anubis-launcher/app/assets/js/scripts/landing.js`.

## Тонкі моменти

- **Filename normalization:** sync санітизує імена in-memory (`Advanced Machines.jar` → `Advanced_Machines.jar`, `foo (1).jar` → `foo.jar`). Сервер не чіпає — нічого не переіменовуємо на live game host.
- **Bukkit plugins:** `/plugins/` (Bukkit-сумісні) **ніколи не йдуть клієнту**. Sync ігнорує цю папку повністю.
- **Конфіги:** `/server/config/*` НЕ синкається з сервера автоматично — ці налаштування ми тримаємо у git вручну (через `raw.githubusercontent.com`). Якщо налаштування мода на сервері змінилось і клієнти повинні його отримати — оновлюй `config/` у репо вручну.
- **Транзитивні залежності клієнтських модів:** FancyMenu потребує `konkrete` + `melody`, OptiFine незалежний, CSL ніяких залежностей. Перевіряй Modrinth-сторінку мода перед додаванням, щоб не отримати crash з `Missing or unsupported mandatory dependencies` у логах Forge.

## Repo URLs

- Sync workflow: https://github.com/damanoreshkan-beep/anubis-distribution/actions/workflows/sync.yml
- Client-mods workflow: https://github.com/damanoreshkan-beep/anubis-distribution/actions/workflows/client-mods.yml
- Issues: https://github.com/damanoreshkan-beep/anubis-distribution/issues
