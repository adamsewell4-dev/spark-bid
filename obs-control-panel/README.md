# Studio Control — OBS Control Panel

A single-file, browser-based control panel for OBS Studio. It is the only interface
the end client ever touches: large branded buttons for recording and scene changes,
with every OBS menu hidden behind it.

- **No install, no backend, no build step.** One HTML file, opened in any browser.
- **No dependencies.** No CDN, no npm packages — it works with the network off.
- **Windows and Mac.** Anything running Chrome, Edge, Safari, or Firefox.
- **Talks to OBS directly** over the obs-websocket server built into OBS 28 and later.

---

## What ships to the client

```
Studio Control/
├── index.html                  ← the control panel (this is the whole app)
├── Open Control Panel.command  ← Mac double-click launcher
├── Open Control Panel.bat      ← Windows double-click launcher
└── README.md                   ← this file (optional for the client bundle)
```

Drop this folder inside the client's preset package alongside their scene collection.

---

## Client setup (what the tutorial video covers)

1. **Open OBS Studio** and load the supplied scene collection.
2. In the OBS menu bar choose **Tools → WebSocket Server Settings**.
3. Tick **Enable WebSocket server**.
4. Click **Show Connect Info** and copy the **Server Password**.
5. **Double-click the launcher** (`Open Control Panel.command` on Mac,
   `Open Control Panel.bat` on Windows). The panel opens in the default browser.
6. Paste the password into the setup window and press **Connect**.

That is the entire setup. The password, address, branding, and button mapping are
saved in the browser, so every launch after this connects on its own.

> Tip for the delivery team: pre-set the same WebSocket password on every seat you
> configure, and the step above becomes "paste the password from the welcome card."

---

## What the panel does

| Control | Behaviour |
|---|---|
| **Start / Stop Recording** | Starts and stops the OBS recording. Only the valid one is ever enabled. |
| **Pause / Resume** | Pauses the recording without ending the file. |
| **Start Meeting** | Switches to the client's meeting scene. |
| **Start Presentation** | Switches to the client's presentation scene. |
| **Switch scene** | Lists every scene in the loaded collection; the live one is highlighted. |
| **Studio / Recording / On screen** | Always-visible status: connection, recording state, live scene. |
| **Timer** | Elapsed recording time, recovered correctly even if the panel is opened mid-recording. |

Scene changes and recording state made **inside OBS** are reflected in the panel
immediately — the panel listens to OBS events rather than polling.

### Meeting and Presentation buttons

By default the panel matches scenes by name: a scene containing "meeting", "call",
"webcam", "camera", or "interview" for the meeting button, and one containing
"presentation", "present", "slide", "screen", "share", or "deck" for the presentation
button. To pin them explicitly, open **Settings** (gear, top right) and pick the exact
scene for each button.

### Branding

Open **Settings** to set the panel name, tagline, and logo (click the logo tile in the
header as a shortcut). The logo is stored on the client's machine, so each seat can
carry its own mark. For a fixed white-label build, edit the `defaults` block near the
top of the script in `index.html`:

```js
var defaults = {
  host: "localhost",
  port: "4455",
  password: "",
  meetingScene: "",
  presentationScene: "",
  title: "Studio Control",
  subtitle: "Professional recording, one tap away",
  logo: "",
  configured: false
};
```

Setting `password` and `configured: true` here ships a seat that connects with zero
setup — appropriate when your team configures the machine before delivery.

Colours live in the `:root` block of the stylesheet; changing `--blue` re-tints the
whole panel.

---

## Connection behaviour

- Connects to `ws://localhost:4455` by default; the address and port are editable in Settings.
- Reconnects automatically with a backing-off retry (1s, 2s, 4s, up to 8s) whenever OBS
  is closed, restarted, or not open yet — no clicking required from the client.
- A wrong password stops the retry loop and says so in plain language, rather than
  silently hammering OBS.
- Every failure message is written for a non-technical reader.

---

## Troubleshooting

| What the client sees | What to tell them |
|---|---|
| "Waiting for OBS to start…" | OBS is not running, or the WebSocket server is not enabled (Tools → WebSocket Server Settings). |
| "That studio password is not correct." | Re-copy the password from OBS's **Show Connect Info** into Settings. |
| "No scenes found." | The scene collection is not loaded — pick it under Scene Collection in OBS. |
| Panel opens but nothing connects | Confirm the port in OBS matches the port in Settings (4455 by default). |

**Do not host this file on an `https://` site.** Browsers block a plain `ws://`
connection from a secure page, and OBS's WebSocket server does not use TLS. Opening the
file directly from disk (what the launchers do) is the supported path. Serving it from a
plain `http://localhost` server also works.

**Browser choice.** Chrome, Edge, and Firefox all connect from a local file without any
extra setup, so the Mac launcher opens Chrome or Edge when either is installed and falls
back to the default browser otherwise. If a client ends up in Safari and the panel will
not connect, either install Chrome or serve the folder locally
(`python3 -m http.server 8000`, then open `http://localhost:8000`).

---

## Technical notes

- Implements the **obs-websocket v5** protocol directly: `Hello` / `Identify` handshake
  with SHA-256 challenge authentication, then `StartRecord`, `StopRecord`, `PauseRecord`,
  `ResumeRecord`, `GetRecordStatus`, `GetSceneList`, `SetCurrentProgramScene`, `GetVersion`,
  and the `CurrentProgramSceneChanged` / `RecordStateChanged` / `SceneListChanged` events.
- SHA-256 is implemented in the file itself, because the browser's built-in `crypto.subtle`
  is not exposed on `file://` pages in every browser.
- Preferences are stored under the `obsControlPanel.v1` key in `localStorage`.
- The password is stored in `localStorage` in plain text, the same as any OBS control
  surface on the machine. It only grants control of the local OBS instance.
