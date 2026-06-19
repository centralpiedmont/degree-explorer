# Degree Explorer — balena Deploy

The kiosk runs as two containers on a Raspberry Pi 5: the Node server (`kiosk`) and the [`balenalabs/browser`](https://github.com/balena-io-experimental/browser) block (Chromium in kiosk mode, pointed at `http://kiosk:8080`).

One `Dockerfile` builds all three tracks (`tech`, `business`, `health`) into the image. The active track is selected at runtime via the `KIOSK_TRACK` fleet environment variable.

---

## Fleet map

| balena Fleet | `KIOSK_TRACK` | Track |
|---|---|---|
| `cpcc-degree-kiosk` | `tech` | Technology |
| `cpcc-business-kiosk` | `business` | Business & Accounting |
| `cpcc-health-kiosk` | `health` | Health Sciences |

---

## Deploy (per fleet)

Run all commands from the **repo root** (`degree-explorer/`).

### 1. Authenticate (one-time)

```bash
balena login
```

### 2. Create the fleet (one-time per fleet)

```bash
balena fleet create cpcc-degree-kiosk    --type raspberrypi5
balena fleet create cpcc-business-kiosk  --type raspberrypi5
balena fleet create cpcc-health-kiosk    --type raspberrypi5
```

### 3. Set `KIOSK_TRACK` per fleet

```bash
balena env add KIOSK_TRACK tech     --fleet cpcc-degree-kiosk
balena env add KIOSK_TRACK business --fleet cpcc-business-kiosk
balena env add KIOSK_TRACK health   --fleet cpcc-health-kiosk
```

### 4. Set SMTP variables (per fleet)

These control outbound lead-capture emails. When `SMTP_HOST` is unset, the drain loop is disabled and leads queue safely to disk until it is set.

```bash
# Example for cpcc-degree-kiosk; repeat for the other two fleets.
balena env add SMTP_HOST  smtp.example.org  --fleet cpcc-degree-kiosk
balena env add SMTP_PORT  587               --fleet cpcc-degree-kiosk
balena env add SMTP_USER  kiosk@cpcc.edu    --fleet cpcc-degree-kiosk
balena env add SMTP_PASS  <secret>          --fleet cpcc-degree-kiosk
balena env add MAIL_FROM  no-reply@cpcc.edu --fleet cpcc-degree-kiosk
```

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | _(unset)_ | SMTP server hostname; when unset, email drain is disabled |
| `SMTP_PORT` | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | _(unset)_ | SMTP auth username |
| `SMTP_PASS` | _(unset)_ | SMTP auth password |
| `MAIL_FROM` | `no-reply@cpcc.edu` | From address on outbound lead-capture emails |

### 5. Push and build

```bash
# From the repo root — the compose build context is `.` and Dockerfile is deploy/Dockerfile.
balena push cpcc-degree-kiosk
balena push cpcc-business-kiosk
balena push cpcc-health-kiosk
```

---

## Provisioning a device

1. Download balenaOS for the `raspberrypi5` fleet (or `raspberrypi4-64` if using a Pi 4) and flash to a microSD card using Etcher.
2. Boot the Pi — it registers automatically with the fleet.
3. Attach the 27" touchscreen.
4. Set **landscape orientation** via the fleet display config variables in the balena dashboard:
   - `BALENA_HOST_CONFIG_display_rotate` — set to `0` for landscape (no rotation) or adjust for your panel orientation.
   - `RESIN_HOST_CONFIG_display_rotate` — legacy alias; set the same value for compatibility with older balenaOS versions.
5. The two containers (`kiosk` and `browser`) start automatically on every boot.

**Architecture note:** the `browser` block image tag in `docker-compose.yml` ends in `-aarch64` — this must match the Pi's architecture. If you switch Pi models, update that tag.

---

## Lead retrieval

Leads captured by the "Email this" feature are appended to `/data/outbox.jsonl` inside the `leads` volume.

- **Automatic drain:** when `SMTP_HOST` is set and the Pi has internet, the server drains the outbox via SMTP on a regular loop.
- **Manual retrieval:** from the balena device dashboard → Terminal → open a shell in the `kiosk` container → `cat /data/outbox.jsonl`.

---

## Offline behavior

The app runs entirely offline at events. The Pi does not require venue Wi-Fi to function:

- All program data, images, and front-end assets are bundled inside the image at build time.
- Degree-sheet QR codes encode GitHub Pages URLs — students scan with their own phones on cellular.
- Info-session QR codes work the same way.
- Email captures queue to disk and are drained the next time the device is online (e.g., back on campus).

The only things that require internet: balena OTA updates (pull updates when on campus before each event) and outbound SMTP for lead capture.

---

## Updating content

After editing any track data source, rebuild and redeploy:

```bash
# From repo root
balena push cpcc-degree-kiosk      # or whichever fleet changed
```

The image rebuild runs `npm run build` (all tracks) so all three tracks stay in sync in a single image; only the fleet env var `KIOSK_TRACK` selects which one is served.
