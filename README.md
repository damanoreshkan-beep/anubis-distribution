# Anubis World — Distribution (draft)

Drafted content для репозиторію `anubis-distribution`. Після ініціалізації GitHub-репо просто `git init` тут.

## Вміст

| Папка | Розмір | Файлів |
|---|---|---|
| `mods/` | 127 MB | 66 (включно з `mods/1.12.2/mcef-coremod.jar`) |
| `config/` | 11 MB | 104 |
| `shaderpacks/` | 28 MB | 18 |
| `resourcepacks/` | 11 MB | 11 |
| **Всього** | **175 MB** | 199 |

## Джерело
Витягнуто з `../minecraft-project/MojNovyLauncher/assets/hitech_files/` (Python-версія лаунчера).

Викинуто: `assets/`, `libraries/`, `runtime/`, `natives/`, `logs/`, `crash-reports/`, `screenshots/`, `saves/`, `xaero/`, `llibrary/`, `local/`, `profileImage/`, `downloads/`, `XaeroWaypoints_BACKUP240807/`, `CustomDISkins/`, `server-resource-packs/`, `scripts/`, `patchouli_books/`, `resources/`, `resourses/` (typo), `options.txt`, `servers.dat`, `AnubisWorld_HiTech.jar/.json`, `java.exe`, `java.dll`.

## Оптимізація шейдерів
Видалено дублі старих версій:
- `ComplementaryReimagined_r5.3.zip` (лишилось `r5.5.1`)
- `ComplementaryUnbound_r5.3.zip` (лишилось `r5.5.1`)

Sildur's (Basic / Enhanced Default / Vibrant) — НЕ дублі, це різні шейдерпаки з однієї лінійки.

## Що далі
1. Згенерувати `distribution.json` (Helios format) Node-скриптом → SHA1/size для кожного файла + URL до GitHub Release
2. Запушити в репо `anubis-distribution`
3. Створити `v1.0.0` Release, upload модів як assets
4. Activate GitHub Pages для `/docs/distribution.json`

Деталі — у `/home/mrx/minecraft-project/CLAUDE.md`.
