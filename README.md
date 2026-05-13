# LoRa-LTE Node — Flasher en ligne

Outil de flashage Web pour les nodes capteurs LoRa/LTE basés sur Heltec Wireless Stick Lite V3 (ESP32-S3).

**👉 [Lancer le flasher](https://di-ny.github.io/lora_lte_node-flasher/)**

## Modes de flash

| Mode | Effet | Quand l'utiliser |
|------|-------|------------------|
| **Mise à jour firmware** | Remplace uniquement le code applicatif. NVS, clés LoRaWAN, paramètres et records bufferisés **conservés**. | Mises à jour de routine |
| **Flash usine complet** | Réinscrit bootloader + table de partitions + application. **Efface toute la flash**, y compris la NVS. | Device neuf, sinistre logiciel, changement de table de partitions |

⚠️ Le flash usine efface les clés LoRaWAN du device — un ré-appairage sur le serveur ChirpStack sera nécessaire.

## Prérequis navigateur

L'API Web Serial requise n'est disponible que sur :
- Google Chrome (desktop)
- Microsoft Edge (desktop)
- Opera (desktop)

Firefox et Safari ne sont pas supportés.

## Prérequis système

- Driver USB-série : sur Windows, [CP210x VCP](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) (souvent déjà installé).
- Câble USB-C de données (pas uniquement charge).

## Procédure

1. Brancher le node sur un port USB-C.
2. Ouvrir [https://di-ny.github.io/lora_lte_node-flasher/](https://di-ny.github.io/lora_lte_node-flasher/).
3. Cliquer sur le bouton du mode souhaité.
4. Sélectionner le port COM du device dans la fenêtre du navigateur.
5. Attendre la fin du flash (~30 s pour une mise à jour, ~60 s pour un flash complet).

Si le flash automatique échoue : maintenir `BOOT`, appuyer sur `RESET`, relâcher `BOOT`, puis relancer.

## Architecture technique

Repo statique servi par GitHub Pages. Tout le code de flash s'exécute **dans le navigateur du client** via [ESP Web Tools](https://esphome.github.io/esp-web-tools/) et l'API Web Serial — aucun backend, aucune donnée du device transmise à un serveur tiers.

Le firmware compilé (`firmware/*.bin`) ne contient ni clé d'authentification ni secret partagé : les credentials de chaque device sont dérivés de son ICCID SIM (LTE) ou DevEUI (LoRaWAN) et stockés en NVS, jamais dans le binaire.

## Versionnement

Chaque release publiée tague le repo avec `vX.Y.Z` et met à jour les `manifest-*.json` ainsi que les binaires dans `firmware/`. Le code source du firmware est dans un repo séparé (privé).

## Licence

MIT — voir [LICENSE](LICENSE).
