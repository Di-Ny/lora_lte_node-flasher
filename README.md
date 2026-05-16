# LoRa-LTE Node — Web Flasher

Outil de flashage en ligne pour les nodes capteurs LoRa/LTE basés sur Heltec Wireless Stick Lite V3 (ESP32-S3).

**👉 [Lancer le flasher](https://di-ny.github.io/lora_lte_node-flasher/)**

Aucune installation requise — tout s'exécute dans le navigateur via [ESP Web Tools](https://esphome.github.io/esp-web-tools/) et l'API [Web Serial](https://wicg.github.io/serial/).

---

## Comment ça marche pour l'utilisateur

| Étape | Action |
|------|--------|
| 1 | Brancher le node sur un port USB-C |
| 2 | Ouvrir [https://di-ny.github.io/lora_lte_node-flasher/](https://di-ny.github.io/lora_lte_node-flasher/) sur **Chrome**, **Edge** ou **Opera** desktop |
| 3 | **⚠️ Choisir le serveur destinataire en premier** (INRAE ou Test). Tant qu'aucun serveur n'est choisi, tout le reste de la page est verrouillé (overlay flou). |
| 4 | Cliquer **Connecter** dans la barre du haut et sélectionner le port COM |
| 5 | Choisir la **version** (dropdown), le **mode** (V1 / V1NTC / DENDRO) et les **options radio** (GSM / LoRa / GSM+LoRa) |
| 6 | Cliquer **Mise à jour** (NVS préservée) ou **Flash usine** (efface tout) |
| 7 | Confirmer l'erase (si Flash usine), confirmer le port → flash lance |
| 8 | À la fin, le terminal série reprend automatiquement le log du device |

**Pourquoi le choix de serveur est critique** : chaque option correspond à une URL de serveur HTTP différente, compilée en dur dans le firmware. Un mauvais choix au moment du flash envoie les données du device chez le mauvais destinataire — d'où le verrouillage de la page tant que le choix n'est pas fait explicitement.

Firefox et Safari ne sont **pas** supportés (Web Serial est Chromium-only).

---

## Architecture technique

### Tout est statique

GitHub Pages sert ce repo en HTTP. Aucun backend, aucune base de données. Tous les fichiers nécessaires au flash sont **dans ce repo et téléchargés par le navigateur** côté client.

```
Navigateur                    GitHub Pages (CDN statique)
─────────                     ────────────────────────────
fetch("/")           ────→   sert index.html
fetch("builds.json") ────→   sert builds.json
fetch("manifests/..json")────→   sert le manifest choisi
fetch("firmware/..bin")  ────→   sert le binaire firmware

                          ↓
            (JS fait écrire ce bin sur le port USB)
            (via Web Serial API du navigateur)
                          ↓
            ESP32-S3 reçoit le firmware
```

Le navigateur **n'a jamais besoin de revenir au serveur** pendant le flash : tout est en mémoire JS.

### Structure du repo

```
lora_lte_node-flasher/
├── index.html              # UI du flasher (HTML/CSS/JS)
├── builds.json             # Catalogue des builds disponibles
├── manifests/              # 1 manifest ESP Web Tools par (version × trame × radio × mode)
│   ├── v3.8.0-v1ntc-gsm-factory.json
│   ├── v3.8.0-v1ntc-gsm-update.json
│   └── ...
├── firmware/               # Binaires .bin (1 full + 1 app par combo)
│   ├── v3.8.0-v1ntc-gsm-full.bin
│   ├── v3.8.0-v1ntc-gsm-app.bin
│   └── ...
├── .flasher-version        # Compteur auto-incrémenté du flasher (UI)
├── README.md               # ce fichier
├── LICENSE                 # GNU AGPL v3
└── NOTICE                  # Attributions des dépendances tierces
```

---

## Spécifications des fichiers

### `builds.json` — catalogue des builds

Décrit la matrice **serveurs × trames × radios × versions** et où trouver chaque manifest. Lu par le JS au chargement de la page.

```json
{
  "servers": [
    { "id": "inrae", "label": "INRAE", "description": "Serveur INRAE (institutionnel)" },
    { "id": "test",  "label": "Test",  "description": "Serveur de test (perso)" }
  ],
  "trames": [
    { "id": "v1",     "label": "V1",     "description": "Node basique (4 NTC)" },
    { "id": "v1ntc",  "label": "V1NTC",  "description": "V1 + 12 NTC supplémentaires" },
    { "id": "dendro", "label": "DENDRO", "description": "V1 + 4 entrées analogiques (dendromètres)" }
  ],
  "radios": [
    { "id": "gsm",      "label": "GSM",      "tooltip": "Modem cellulaire seul (SIM7080G)" },
    { "id": "lora",     "label": "LoRa",     "tooltip": "Radio LoRaWAN SX1262 seule (EU868)" },
    { "id": "lora-gsm", "label": "LoRa+GSM", "tooltip": "Radio LoRaWAN + modem cellulaire (EU868)" }
  ],
  "versions": [
    {
      "id": "3.8.0",
      "date": "2026-05-14",
      "notes": "Texte affiché sous le sélecteur version.",
      "builds": {
        "inrae-v1ntc-gsm": {
          "available": true,
          "manifestUpdate":  "manifests/v3.8.0-inrae-v1ntc-gsm-update.json",
          "manifestFactory": "manifests/v3.8.0-inrae-v1ntc-gsm-factory.json"
        },
        "test-v1ntc-gsm":  { "available": true, ... },
        "inrae-v1ntc-lora": { "available": false },
        ...
      }
    }
  ]
}
```

**Règles** :
- `servers[]` : dimension la plus critique. Conditionne où le device envoie ses données. **Aucun défaut** côté UI : l'utilisateur DOIT cliquer activement sur un serveur (overlay flou bloquant tant qu'aucun choix n'est fait).
- `versions[]` est trié côté JS par semver descendant (3.10.0 > 3.9.0 > 3.8.0 > 3.8.0-rc1)
- La clé de chaque build est `<serverId>-<trameId>-<radioId>` (ex: `inrae-v1ntc-lora-gsm`)
- Si `available: false`, l'UI affiche la combo comme indisponible et désactive les boutons
- 2 serveurs × 3 trames × 3 radios = **18 builds par version**

### `manifests/v<X.Y.Z>-<server>-<trame>-<radio>-<mode>.json` — manifest ESP Web Tools

Format défini par [ESP Web Tools](https://esphome.github.io/esp-web-tools/#manifest). Un manifest par combinaison **(version, serveur, trame, radio, mode)**.

Le `server` (INRAE / Test) reflète si `SERV_INRAE` est défini ou non dans `Conf.h` au moment de la compilation, ce qui détermine l'URL du serveur destinataire dans le firmware.

```json
{
  "name": "LoRa-LTE Node v3.8.0 V1NTC GSM - Flash usine",
  "version": "3.8.0",
  "new_install_prompt_erase": true,
  "builds": [
    {
      "chipFamily": "ESP32-S3",
      "parts": [
        { "path": "../firmware/v3.8.0-v1ntc-gsm-full.bin", "offset": 0 }
      ]
    }
  ]
}
```

**Différence Update vs Factory** :
| Champ | Update | Factory |
|-------|--------|---------|
| `name` | "...- Mise à jour" | "...- Flash usine" |
| `new_install_prompt_erase` | `false` | `true` |
| `parts[].path` | identique (`*-full.bin`) | identique |
| `parts[].offset` | `0` | `0` |

Avec `new_install_prompt_erase: true`, ESP Web Tools appelle `esploader.eraseFlash()` (chip erase complet 8 MB) **avant** d'écrire le binaire. Avec `false`, seuls les secteurs où on écrit sont effacés — la NVS (`0x9000`-`0xE000`) survit donc les clés LoRaWAN sont préservées.

### `firmware/v<X.Y.Z>-<server>-<trame>-<radio>-full.bin` — image complète

Image **merged** générée par `esptool merge_bin` qui concatène à leurs bons offsets :

| Composant | Offset | Source |
|-----------|--------|--------|
| Bootloader | `0x0000` | `.pio/build/.../bootloader.bin` |
| Partition table | `0x8000` | `.pio/build/.../partitions.bin` |
| OTA data | `0xE000` | `~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin` |
| Application | **`0x10000`** | `.pio/build/.../firmware.bin` |

**⚠️ Pièges qui causent un boot loop** :
- App **doit** être à `0x10000` (la table de partitions du projet l'exige). À `0x20000` → boot loop `RTC_SW_SYS_RST` avec PC fixe (bytes garbage interprétés comme du code).
- Flash mode **doit** être `dio` (pas `qio`). Sur ESP32-S3, le bootloader ROM ne sait démarrer qu'en DIO.
- Flash freq `80m`, flash size `8MB`.

Commande de génération équivalente :
```bash
esptool.py --chip esp32s3 merge_bin \
  -o firmware/v3.8.0-v1ntc-gsm-full.bin \
  --flash_mode dio --flash_freq 80m --flash_size 8MB \
  0x0000   bootloader.bin \
  0x8000   partitions.bin \
  0xe000   boot_app0.bin \
  0x10000  firmware.bin
```

### `firmware/v<X.Y.Z>-<server>-<trame>-<radio>-app.bin` — application seule

Copie directe du `firmware.bin` produit par PlatformIO (~600 KB). **Pas utilisé** par les manifests actuels (qui pointent tous vers `-full.bin` à offset 0), mais conservé pour usage futur (OTA, mise à jour via downlink LoRaWAN, etc.).

### `.flasher-version` — compteur UI

Fichier texte contenant un entier (sur une ligne). Auto-incrémenté à chaque publish via script. Affiché en bas de page sous la forme `Flasher #N - YYYY-MM-DD HH:MM (sha)` pour vérifier rapidement quelle version de l'UI le navigateur charge (utile pour diagnostiquer les caches navigateur agressifs).

### `index.html` — UI

Page HTML standalone (un seul fichier, ~30 KB) contenant le CSS et le JS inline. Charge `esp-web-tools@10` depuis unpkg.com en module JS. Pas de framework, pas de build step.

Marqueurs spéciaux dans le HTML :
- `<!-- BUILD_TAG_START -->...<!-- BUILD_TAG_END -->` : zone remplacée par le script à chaque publish pour injecter `Flasher #N - date (sha)`

---

## Génération automatisée des builds

L'écriture manuelle des 18 fichiers (9 combos × 2 modes) + des 9 binaires + de `builds.json` à chaque release n'est pas tenable. Le projet inclut un script qui fait tout en une commande.

### Script Windows / PowerShell

Hébergé dans le repo firmware (privé). Localisation : `Code/lora_lte_node/build_release.ps1`.

```powershell
cd D:\path\to\lora_lte_node\Code\lora_lte_node
.\build_release.ps1 -Version "3.9.0"
```

À la fin : prompt `Publier sur GitHub ? (o/N)` → publie automatiquement sur ce repo flasher.

### Script Linux / WSL / macOS

Pour les utilisateurs sur Linux ou WSL (et notre client sur Linux pur), un équivalent shell est disponible : `build_release.sh` dans le repo firmware également.

```bash
cd /path/to/lora_lte_node/Code/lora_lte_node
./build_release.sh --version 3.9.0
```

### Que fait le script (résumé)

1. **Backup** de `Conf.h`
2. Pour chaque combo (3 trames × 3 radios = 9) :
   - **Patche** `Conf.h` (TRAME, GSM_ACTIVE, LORA_ACTIVE)
   - `pio run` → produit `bootloader.bin`, `partitions.bin`, `firmware.bin`
   - `esptool merge_bin` → produit `vX.Y.Z-trame-radio-full.bin` (DIO, 80MHz, 8MB)
   - Copie `firmware.bin` → `vX.Y.Z-trame-radio-app.bin`
   - Génère les 2 manifests JSON (update + factory)
3. **Restaure** `Conf.h` (try/finally garanti même en cas d'erreur)
4. Met à jour `builds.json` (tri semver)
5. **Prompt** publish (o/N)
6. Si oui : incrémente `.flasher-version`, injecte tag dans `index.html`, `git add/commit/push`

Durée : ~10-15 min (9 compilations × ~1 min).

### Génération manuelle (à éviter mais possible)

Si tu veux générer un seul build à la main sans script :

```bash
# 1. Configure Conf.h pour la combo voulue (TRAME, GSM_ACTIVE, LORA_ACTIVE)
# 2. Compile
pio run -e heltec_wireless_stick_lite_v3

# 3. Merge avec esptool (offsets ESP32-S3 default_8MB.csv)
esptool.py --chip esp32s3 merge_bin \
  -o v3.9.0-v1ntc-gsm-full.bin \
  --flash_mode dio --flash_freq 80m --flash_size 8MB \
  0x0000   .pio/build/heltec_wireless_stick_lite_v3/bootloader.bin \
  0x8000   .pio/build/heltec_wireless_stick_lite_v3/partitions.bin \
  0xe000   ~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin \
  0x10000  .pio/build/heltec_wireless_stick_lite_v3/firmware.bin

# 4. Copie dans le repo flasher
cp v3.9.0-v1ntc-gsm-full.bin /path/to/lora_lte_node-flasher/firmware/

# 5. Crée les 2 manifests JSON (update + factory) — voir specs plus haut

# 6. Édite builds.json : ajoute l'entrée { "v1ntc-gsm": { "available": true, "manifestUpdate": "...", "manifestFactory": "..." } }

# 7. Commit + push
cd /path/to/lora_lte_node-flasher
git add . && git commit -m "Add v3.9.0-v1ntc-gsm" && git push
```

---

## Verifier qu'une nouvelle release est en ligne

1. Ouvre la page, `Ctrl+Shift+R`
2. Regarde le tag en bas : `Flasher #N — YYYY-MM-DD HH:MM (sha)`
3. Si le `#N` n'a pas augmenté ou si la date est ancienne → cache navigateur, attendre 1 min (GitHub Pages a un cache HTTP de 600 s) ou ouvrir en navigation privée.

---

## Versioning du flasher (compteur `Flasher #N`)

Le numéro `Flasher #N` affiché en bas de page identifie la version de l'**outil de flashage** (UI + scripts), indépendante de la version du firmware sélectionné dans le dropdown.

Il est **auto-bumpé à chaque `git push` qui modifie l'outil**, via un git hook `pre-push` situé dans `scripts/git-hooks/pre-push`. Le hook :
1. Analyse les fichiers modifiés par les commits à pusher
2. **Si tous les changements sont dans `firmware/`, `manifests/` ou `builds.json`** → c'est une release firmware → **pas de bump**
3. **Sinon** (modif de `index.html`, `README.md`, `scripts/`, etc.) → bump :
   - Incrémente `.flasher-version`
   - Met à jour le tag dans `index.html` avec le nouveau numéro, la date et le SHA court de HEAD
   - Crée un commit `Bump Flasher #X -> #Y` ajouté au push

Conséquence : tu peux publier 10 releases firmware d'affilée sans toucher au compteur. Le `Flasher #N` ne monte que quand toi tu modifies l'outil lui-même (UI, doc, scripts, schéma de `builds.json`).

### Installation du hook (à faire une fois par clone)

Les hooks Git ne sont pas synchronisés via GitHub (ils sont dans `.git/hooks/` qui est local). Pour activer le hook fourni dans ce repo :

```bash
git config core.hooksPath scripts/git-hooks
```

Sur Windows / WSL, vérifier que le fichier reste exécutable :
```bash
chmod +x scripts/git-hooks/pre-push
```

### Désactiver temporairement

Pour pousser sans bumper (ex: doc-only fix) :
```bash
git push --no-verify
```

### Si tu forke ce repo

Pense à activer le hook (commande ci-dessus) sinon ton numéro `Flasher #N` ne montera plus quand tu pousseras tes propres modifications.

---

## Limitations connues

- **Pas de Firefox / Safari** : Web Serial est Chromium-only en 2026
- **Drivers USB-série** à installer côté client (CP210x sur Windows pour ce hardware)
- **HTTPS obligatoire** : Web Serial ne fonctionne pas sur HTTP simple (GitHub Pages fournit HTTPS d'office, OK)
- **Pas d'auto-detection** du device : l'utilisateur doit choisir manuellement trame et radio (limitation par design — le firmware n'expose pas d'identifiant standardisé style Improv)

---

## Licence

Ce projet est distribué sous la licence **[GNU Affero General Public License v3.0](LICENSE)** — © 2026 [Di-Ny](https://github.com/Di-Ny).

Choix AGPLv3 :
- **Libre** : copie, modification, redistribution autorisées
- **Copyleft fort** : tout fork ou dérivé doit rester sous AGPLv3 et publier ses sources
- **Clause réseau** : si vous hébergez une version modifiée accessible via le réseau, vous devez fournir les sources aux utilisateurs (différence clé avec GPLv3)
- **Attribution obligatoire** : la mention du copyright et de la licence doit être conservée

Pour les attributions des dépendances tierces (ESP Web Tools, etc.), voir [NOTICE](NOTICE).
