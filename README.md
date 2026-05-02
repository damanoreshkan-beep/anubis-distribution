# Anubis World — Distribution

Helios-формат feed для модпакa **HiTech** (Minecraft 1.12.2 + Forge 14.23.5.2860). Лаунчер `anubis-launcher` читає `docs/distribution.json` через GitHub Pages і завантажує файли з GitHub Release.

> **Source of truth — живий ігровий сервер.** `mods/` локально + GitHub Release v1.0.0 — це derivative, синхронізуються автоматично через `npm run sync`.

## Live URLs

- Feed: https://damanoreshkan-beep.github.io/anubis-distribution/distribution.json
- Mods/shaderpacks/resourcepacks (binary assets): https://github.com/damanoreshkan-beep/anubis-distribution/releases/tag/v1.0.0
- Configs (text, git-tracked): обслуговуються через `raw.githubusercontent.com`

## Як додати/оновити мод

**Один touchpoint — SFTP сервера.**

1. Завантажуєш jar в `/mods/` на сервері (через панель або SFTP-клієнт)
2. Чекаєш до **04:17 UTC наступного дня** (auto-cron) — або тригериш вручну:
   - GitHub repo → **Actions** → **sync mods from server** → **Run workflow**
3. Через ~1.5 хв `distribution.json` оновлено, нові jar'и в Release як assets — клієнти бачать їх при наступному запуску лаунчера

Видалив мод з сервера → workflow прибере його з feed автоматично. Старі assets лишаються в Release як orphans (нешкідливо).

## Архітектура

```
   ┌──────────────────────┐                ┌────────────────────────┐
   │  Game server         │                │  GitHub Release v1.0.0 │
   │  /mods/*.jar  (SFTP) │   ──sync──→    │  + assets              │
   └─────────┬────────────┘                └────────────┬───────────┘
             │                                          │
             │ canonical                                │ CDN
             │                                          ↓
             │                              ┌────────────────────────┐
             │                              │  docs/distribution.json│
             │                              │  (GitHub Pages)        │
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
| `docs/forge-module.json` | Forge installer + 21 Library subModules. Згенерований `scripts/build-forge-submodules.js`. |
| `docs/servers.dat` | NBT з pre-loaded server entry. Згенерований `scripts/generate-servers-dat.js`. |
| `docs/server-icon.jpg` | 64×64 ікона в server list. |
| `config/` | Кастомні mod-config'и (JEI, Mekanism, FTB Quests, Xaero тощо). Git-tracked, серверні через raw.githubusercontent. |
| `mods/`, `shaderpacks/`, `resourcepacks/` | gitignored, ефемерні. `npm run sync` створює locally; в Release живуть як assets. |
| `scripts/sync-from-server.js` | SFTP pull → upload до Release → regenerate feed |
| `scripts/build-distribution.js` | Сканує локальні `mods/`/`config/`/тощо → пише `docs/distribution.json` |
| `scripts/build-forge-submodules.js` | Тягне Forge installer + libraries з Maven, рахує MD5 |
| `scripts/generate-servers-dat.js` | NBT-encode для `servers.dat` |
| `scripts/sanitize-assets.js` | (legacy) переіменовує файли зі spaces — більше не потрібен, sanitize в `sync-from-server.js` |
| `scripts/client-extras.json` | Список jar'ів які треба клієнту АЛЕ нема на сервері (OptiFine, tlskincape, MixinBootstrap) |
| `scripts/client-skip.json` | Список jar'ів на сервері які НЕ йдуть клієнту (server-only utilities). Зараз порожній. |
| `.github/workflows/sync.yml` | Daily cron `17 4 * * *` UTC + workflow_dispatch |

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

## Тонкі моменти

- **Filename normalization:** sync санітизує імена in-memory (`Advanced Machines.jar` → `Advanced_Machines.jar`, `foo (1).jar` → `foo.jar`). Сервер не чіпає — нічого не переіменовуємо на live game host.
- **Mohist + Bukkit plugins:** сервер на Mohist (Forge+Bukkit hybrid), `/plugins/` (EssentialsX, Clearlag тощо) **ніколи не йдуть клієнту**. Sync ігнорує цю папку повністю.
- **Конфіги:** `/server/config/*` НЕ синкається з сервера автоматично — ці налаштування ми тримаємо у git вручну (через `raw.githubusercontent.com`). Якщо налаштування мода на сервері змінилось і клієнти повинні його отримати — оновлюй `config/` у репо вручну.
- **Forge module:** `forge-module.json` статичний (Forge installer + libraries з Maven). Перебудовуй `npm run build:forge` тільки коли міняєш версію Forge.

## Repo URLs

- Cron status: https://github.com/damanoreshkan-beep/anubis-distribution/actions/workflows/sync.yml
- Issues: https://github.com/damanoreshkan-beep/anubis-distribution/issues
