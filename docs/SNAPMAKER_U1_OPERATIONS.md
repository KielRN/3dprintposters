# Snapmaker U1 Connection And Printing

Last verified: 2026-11-24 (four-color figurine slice and start; earlier sections 2026-10-25)

This is the operator guide for the studio printer **3DPrintYou-U1**. Local
Moonraker access, slicing, upload, and print start have been exercised. This is
an operator-controlled workflow; the product app does not automatically send
customer orders to the printer or synchronize filament inventory.

Keep the current LAN address, Windows installation paths, and artifact paths in
the ignored root `elliot_quick_dev_Startup.md`, under **Snapmaker U1 Local
Connection And Printing**. It also contains the first plate's local receipts.
Use [Print Studio Inventory](PRINT_STUDIO_INVENTORY.md) for equipment and stock,
and [fulfillment research](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md) for
product-quality and manufacturing validation.

## Connection And Tool Numbering

- Printer: Snapmaker U1, four independent factory 0.4 mm nozzles.
- Account profile: `3DPrintYou`; linked printer: `3DPrintYou-U1`.
- The local Moonraker HTTP API responds on port `7125` without credentials on
  the tested LAN. Cloud login is a separate connection and is not required for
  these local API calls. Keep this endpoint on the trusted LAN.
- Cloud credentials, when needed, remain only in the ignored root `.env` as
  `SNAPMAKER_APP_USER_ID` and `SNAPMAKER_APP_PASSWORD`. Never copy values or tokens
  into docs, slicer presets, G-code, or receipts.

| Physical toolhead | Zero-based API extruder | G-code | RFID material / color observed 2026-10-24 |
| --- | --- | --- | --- |
| 1 | `extruder` / index 0 | `T0` | Snapmaker PLA SnapSpeed, White `#E2DEDB` |
| 2 | `extruder1` / index 1 | `T1` | Snapmaker PLA SnapSpeed, Black `#080A0D` |
| 3 | `extruder2` / index 2 | `T2` | Snapmaker PLA SnapSpeed, Red `#E72F1D` |
| 4 | `extruder3` / index 3 | `T3` | Snapmaker PLA SnapSpeed, Yellow `#F4C032` |

RFID presence does not prove filament is fed. Toolhead 2's feed was separately
verified as detected, `load_finish`, `channel_error: ok`; its active printing
state was subsequently observed. Re-read the mapping and loaded material for
each job. A project's one-based filament number or black display color alone
does not prove which physical nozzle will print it.

## Slicer And MCP

- The `orcaslicer` MCP exposes `orca_list_profiles`, `orca_slice`, and
  `orca_analyze_gcode`. It prepares and analyzes files; it does not upload or
  control this printer.
- Official portable OrcaSlicer **2.4.0** is the tested MCP CLI engine. Its release
  ZIP was checked against the published SHA256; local setup notes retain the
  digest and installation details.
- Installed Snapmaker Orca **2.4.0** works through its GUI. Its Windows CLI
  crashed with access violation `3221225477` / `0xC0000005` in the setup tests.
- Portable Orca also crashed on the first modified seven-plate Bambu project.
  Importing the original in Snapmaker Orca's GUI, switching to the U1, saving a
  converted copy, and rebuilding compatible settings produced a successful
  portable slice. This establishes a working recovery path, not the exact
  cause of the access violation. Do not repeatedly run the same failed command.
- Switching printer presets can reset the process profile. Selecting matching
  preset names in the GUI can also replace embedded settings. Verify the actual
  exported G-code, including temperatures, tool commands, and material usage.
- Preserve geometry, scale, orientation, object settings, and local modifiers;
  keep downloaded originals untouched. The successful GUI export retained the
  original plate placement; the CLI slice placed the part differently in XY.
- For multiextruder G-code, inspect every value in the raw filament-use arrays.
  The current MCP analyzer reports the first entry for length/volume, which can
  be `0.00` when only filament 2 is used. Use the raw per-tool arrays and total
  grams rather than interpreting that zero as no filament consumption.

## Prepare, Upload, And Start One Plate

1. Obtain authorization for the specific plate and material. Confirm with the
   owner that the build plate is installed and clear. Authorization to start
   one plate does not authorize subsequent plates after it finishes.
2. Check `GET /printer/info` and
   `GET /printer/objects/query?print_stats&virtual_sdcard&toolhead&extruder1&heater_bed&exception_manager`.
   Before starting, require `ready`, an idle print state, no active SD print,
   and no blocking exceptions. Never start over a printing or paused job.
3. Read `GET /printer/objects/query?filament_detect&filament_feed%20left` for
   RFID and left-feed status. Toolhead 2 is on the left feed module; use the
   corresponding feed module when preparing another tool.
4. Slice only the selected plate with U1-compatible machine/material settings.
   Inspect the preview, supports/brim, dimensions, and modifiers. Verify the
   executable `T` commands, raw per-tool usage, temperatures, and movement bounds
   against the actual printer. A successful slicer exit alone is insufficient.
5. Upload the validated file using `POST /server/files/upload` with multipart
   fields `root=gcodes` and `file`. Inspect the returned path and
   `print_started` / `print_queued` flags. Download the uploaded file through
   `GET /server/files/gcodes/<filename>` and compare its SHA256 to the local file.
6. Set and read back the job's tool mapping and used-extruder state before
   starting. For the verified black plate, `POST /printer/gcode/script` with a
   JSON `script` used `SET_PRINT_TASK_PARAMETERS`: `MAP_TABLE=[[1,1]]`,
   `FILAMENT_USED_G=[0,63.45,0,0]`, `FILAMENT_USED_MM=[0,21273.95,0,0]`,
   `BED_LEVEL=1`, `FLOW_CALIBRATE=0`, `SHAPER_CALIBRATE=0`, and
   `TIME_LAPSE_CAMERA=0`, plus the exported nozzle/process parameters. These are
   per-job settings, not changes to firmware, machine calibration, or printer
   configuration files. Recalculate consumption and parameters for every slice;
   do not reuse this plate's values for another job.
7. Query `print_task_config` and verify logical tool 1 maps to physical index 1,
   `extruders_used` is `[false,true,false,false]`, and slot 2's RFID color is
   `080A0DFF`. Recheck readiness immediately before the start request.
8. Start with `POST /printer/print/start?filename=<URL-encoded-uploaded-path>`.
   If the response times out or is ambiguous, query status before retrying.
   Confirm the expected filename, `print_stats.state: printing`, and
   `virtual_sdcard.is_active: true` before reporting acceptance. Heating/homing
   is startup, not proof that a first layer has been deposited successfully.
9. Check startup exceptions, selected physical extruder, temperatures, and
   advancing layer/filament counters. `GET /server/gcode_store?count=12` can
   help explain startup problems. The owner still needs to inspect adhesion,
   completed geometry, fit, and surface quality.

Do not change printer firmware/configuration as part of slicing or starting a
job. Never expose credentials. Read-only status checks are appropriate while
printing; leave control actions to the authorized job scope.

**Current owner rule (since 2026-10-28):** prepare, upload, check and start jobs
through the official Snapmaker Orca GUI only, not direct Moonraker calls or the
Snapmaker MCP, until the owner says otherwise. The canonical one-plate checklist
is `E:\PROJECTS\Home3DPrinting\PRINTER.md`, and spool balances live in that
project's shared `SPOOL_LEDGER.json`. The API steps above are historical reference.

## Four-Color Figurine Slicing

First used 2026-11-24 for attempt `BIZ-CHIBI-4C-T01-A01`: the 75 mm Meshy cartoon
four-color Chibi heroine from `exp-022-u1-four-color-chibi`. These are the starting
settings for four-color figurine tests. They are not validated until the physical
result is reviewed (see Outcome below).

### Import

1. Work on a copy of the Meshy multicolor 3MF; keep the downloaded original untouched.
2. In Snapmaker Orca, select the **Snapmaker U1 (0.4 nozzle)** printer preset first,
   then use **Import** (Ctrl+I) on the 3MF. The triangle painting comes through on
   the four filament slots. Meshy's embedded machine settings are not adopted: the
   exported G-code reports `single_extruder_multi_material = 0` and four 0.4 mm nozzles.
3. Decline the "more than 1M triangles, simplify?" prompt. Simplifying could move the
   color boundaries; that is untested.

### Settings

| Area | Setting | Value | Why |
| --- | --- | --- | --- |
| Process | Preset | 0.12mm Standard @Snapmaker U1 | Face/eye color detail; 624 layers at 75 mm |
| Support | Type / style | Tree (auto), default style | Default tree supports |
| Support | Threshold angle | **15°** (default 25°) | Supports only near-flat overhangs (hair underside, arms, hands, skirt hem) |
| Support | On build plate only | On | Supports never land on the painted figure |
| Support | Critical regions only | Off | Saves just 0.7 g; risks chin/hair sag |
| Support | Base / interface filament | **Default** | Uses whichever filament is active, so supports add no tool changes. Forcing one color adds changes. |
| Multimaterial | Prime tower | On, Rib wall, width 30 | Snapmaker default; keeps a tall, thin tower stable |
| Multimaterial | Prime volume | **15 mm³** (default 27) | Biggest single saving; see results |
| Multimaterial | No sparse layers (beta) | Off | Saves only 2.4 g, adds time, splits the job into 1,114 layers |
| Multimaterial | Walls / infill / solid infill filament | 1 (black) | Interior prints in the most plentiful color |

Snapmaker Orca numeric fields append text on triple-click. Use click, Ctrl+A,
type, Tab, then read the value back. One attempt turned 25 into "2515", which
clamped to 90°.

### Results On The 75 mm Chibi

| Variant | Supports | Prime tower | Total | Time |
| --- | ---: | ---: | ---: | ---: |
| Snapmaker defaults (0.12 mm) | 8.0 g | 49.7 g | 73.2 g | 8h 00m |
| + 15° support threshold | 6.3 g | 49.7 g | 71.6 g | 7h 46m |
| **+ prime volume 15 (printed)** | **6.3 g** | **33.8 g** | **55.7 g** | **6h 55m** |
| + critical regions only (rejected) | 5.7 g | 33.8 g | 55.0 g | 6h 48m |
| + no sparse layers (rejected) | 6.3 g | 31.4 g | 53.3 g | 7h 02m |

Support placement was effectively unchanged by "on build plate only", so the
trees already rose from the plate. The model itself is 15.55 g. With 887 color
changes, the prime tower is still about 61% of the material. Untested, quality-trading
ways to cut it further: 0.16 mm layers (roughly 25% fewer changes, softer
face detail); prime volume 10; or a small no-tower test print.

### Save, Upload, Map, Start

1. Use **File > Save Project as** with a new name. In testing, Ctrl+Alt+S silently
   saved over the open 3MF.
2. Export the G-code and check the per-tool `filament used [g]` array,
   `prime_volume`, the support settings and the temperatures in the header.
3. **Print > Upload** (not "Upload and Print") > select `3DPrintYou-U1` LAN > Send.
4. **Device** tab > folder icon > Local Files > the file > **File information**.
   It auto-maps slicer filaments to toolheads by display color. For this load it
   correctly chose slicer 1 black > toolhead 2, 2 white > 1, 3 blue > 3,
   4 skin > 4. Always verify this against the physical load. A display color is
   not proof of material identity.
5. Turn on Extrusion Flow Calibration and Auto Leveling; leave time-lapse off.
   Click Send once, then verify the exact filename shows `working` at 0/N layers.

### Outcome

Started 2026-11-24 about 14:11 CST: 624 layers, 6h 54m estimate, 55.69 g
(black 14.29, white 17.89, blue 3.19, skin 20.32). Not yet verified: first layer,
tool-change ooze at prime volume 15, completion, color registration, face
quality, support removal, and the Matte Skin shade. Record the result here and in
the [fulfillment research](../research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md).
The start receipt is `receipts/BIZ-CHIBI-4C-T01/start-receipt.json` in Home3DPrinting.

## Verified First Job: Open SAMLA Top-Cover Base

Source: [Snapmaker U1 top-cover base on MakerWorld](https://makerworld.com/en/models/2076469-snapmaker-u1-top-cover-base).
The selected project is **U1 top cover open.3mf**, the cable-friendly IKEA SAMLA
top cover. The closed version and filament drybox are different projects.

| Plate | Part | Recorded outcome as of 2026-10-25 |
| --- | --- | --- |
| 1 | FL / front-left | Printer confirmed complete, 116/116 layers; owner removed part and confirmed bed clear for plate 2; fit/finish review not recorded |
| 2 | FR / front-right | Printer confirmed complete, 116/116 layers, no exceptions; owner removed FR and confirmed build plate installed and clear for plate 3 |
| 3 | Middle-right | Printer confirmed complete, 100/100 layers, no exceptions; owner reported ready for next plate, accepted as removal and clear-bed confirmation |
| 4 | Rear-left | Printer confirmed complete, 200/200 layers, no exceptions; owner reported printer free and ready for plate 5 |
| 5 | Rear-right | Printer confirmed complete, 200/200 layers, no exceptions; owner confirmed bed clear for plate 6 |
| 6 | Middle-left | Printer confirmed complete, 100/100 layers, no exceptions; owner confirmed finished and bed clear for plate 7 |
| 7 | Connecting pins | Printer confirmed complete, 75/75 layers, no exceptions; owner reports the assembled cover fits nicely |

Final file: `U1-SAMLA-open-plate1-FL-BLACK-T1.gcode`.
The Snapmaker Orca GUI export uses 0.2 mm layers (0.25 mm first layer), 3 walls,
5% grid infill, no supports, textured PEI, automatic brim, and the source's local
30% infill modifiers. It selects only `T1`, with 220 C nozzle and 65 C bed.
Estimated model time is **1h 17m 40s**, **116 layers**, **63.45 g** /
**21,273.95 mm** / **51.17 cm3**. Startup, leveling, and cleaning add elapsed
time. This estimate is not measured stock depletion or a completed-print result.

The uploaded file was 2,015,394 bytes and matched SHA256
`f9fe9ece25e8cd628a3742ba7949a71617586b32adf08e45a214bd93740ab240`.
Moonraker returned `result: ok` for start, then reported the expected filename,
active SD printing, and no exceptions. A subsequent read showed homed XYZ,
active `extruder1`, 220 C nozzle / 65 C bed, current layer 1, and increasing
filament consumption. A later check confirmed plate 1 complete at 116/116 layers
with no exceptions, about 87m 12s elapsed / 77m 44s print time and 21,270.75 mm
reported filament use. The owner confirmed removing it and clearing the bed.
Physical fit/finish and Chibi production readiness remain unverified. Each
subsequent plate requires the owner to remove
the finished parts and confirm the bed is clear before another start.

Plate 2 was exported from the same Snapmaker Orca project as
`U1-SAMLA-open-plate2-FR-BLACK-T1.gcode`: 116 layers, 64.58g / 21,653.99mm /
52.08cm3, estimated model time 1h 19m 37s plus startup, same process settings
and 220 C nozzle / 65 C bed. Only T1 is selected. Upload checksum matched SHA256
`ad926a8ea153f9a935a1d263f2438d8ad0cb9a2bca45d0998fffcd93c5c0ca3f`
(2,134,416 bytes). Per-job consumption values were recalculated and physical
toolhead 2 mapping read back before start. Moonraker returned `result: ok` and
the expected filename with active `printing` state and no exceptions. A live
check at 16:24 CDT on 2026-10-24 subsequently confirmed plate 2 complete at
116/116 layers, no exceptions, virtual SD inactive, heaters off, 5382.45 s
elapsed / 4781.49 s print time, and 21650.79 mm reported filament use.
The owner then confirmed FR removed and the build plate installed and clear for
plate 3.

Plate 3 (middle-right) was sliced and exported from the same Snapmaker Orca GUI
project as `U1-SAMLA-open-plate3-middle-right-BLACK-T1.gcode`: 100 layers,
32.92 g / 11036.06 mm / 26.54 cm3, estimated 38m 39s including slicer prepare
time, plus printer startup. The same process settings and T1-only selection
were verified, with 220 C nozzle / 65 C bed. Automatic brim remains enabled;
this plate's preview did not generate brim. The four source 30% corner modifiers
remain present; the middle-right source object has no local modifier.
Movement bounds, including 485 arcs, were checked: X 85-185 mm,
Y 1-220.74 mm, Z 0.2-20.45 mm. Uploaded 952110 bytes matched SHA256
`c248f20c80d1529cef119aee595394cee9b8bec6b5854e232ea70260c4a9e8c6`.
Fresh job consumption, mapping [[1,1]], physical toolhead 2 black PLA and loaded
feed/sensor state were verified, with bed leveling enabled. Start returned
`result: ok`; live readback confirmed the exact filename, `printing`, active
virtual SD, active `extruder1`, and no exceptions. Heating was underway, with
140 C nozzle preheat / 65 C bed targets. A later live check confirmed plate 3
complete at 100/100 layers with no exceptions and inactive virtual SD:
2924.64 s elapsed / 2321.00 s print time, 11032.86 mm reported filament use.
The owner's "ready for the next one" followed the request for plate 3 removal
and a clear bed and was accepted as that physical readiness confirmation.

Plate 4 (rear-left) was exported from the same Snapmaker Orca GUI project as
`U1-SAMLA-open-plate4-RL-BLACK-T1.gcode`: 200 layers, 124.75 g / 41826.50 mm /
100.60 cm3, estimated 2h 17m 53s plus printer startup. The same process settings,
T1-only selection, 220 C nozzle / 65 C bed, and automatic brim were verified.
The rear-left 30% modifier's actual mesh and component transform match the
downloaded original. Bounds including 1467 arcs: X 20.518-250.482 mm,
Y 1-252.482 mm, Z 0.2-40.45 mm. Uploaded 2692654 bytes matched SHA256
`8e56ec2131249fff110d5d73624462fedc2a4707f31b0d2cf926e0349939cda3`.
Fresh consumption, mapping [[1,1]], physical toolhead 2 black PLA, loaded feed
and enabled filament detection were verified, with bed leveling enabled.
Start returned `result: ok`; live readback confirmed the exact filename,
`printing`, active virtual SD, active `extruder1`, and no exceptions. Startup
heating was underway. A live check on 2026-10-25 confirmed plate 4 complete at
200/200 layers, no exceptions, inactive virtual SD and heaters off: 8866.62 s
elapsed / 8263.75 s print time, 41823.29 mm reported filament use. The owner
reported the printer free and ready for the next part, accepted as removal
and clear-bed confirmation for plate 5. Physical fit/finish remains unreported.

Plate 5 (rear-right) was exported from the same Snapmaker Orca GUI project as
`U1-SAMLA-open-plate5-RR-BLACK-T1.gcode`: 200 layers, 128.93 g / 43228.44 mm /
103.98 cm3, estimated 2h 19m 33s plus printer startup. Same process settings,
220 C nozzle / 65 C bed, T1 only, and brim were verified. The rear-right 30%
modifier's actual mesh and component transform match the downloaded original.
Bounds including 907 arcs: X 7.125-263.875 mm, Y 1-253.377 mm,
Z 0.2-40.45 mm. Uploaded 2741695 bytes matched SHA256
`295901c4e236b8c9643cfab3d4301f45d682377c476c5b344dfe04856e3a1cdf`.
Fresh consumption, mapping [[1,1]], black PLA on physical toolhead 2, loaded
feed and enabled filament detection were verified, with bed leveling enabled.
Start returned `result: ok`; exact filename, `printing`, active virtual SD,
`extruder1`, and no exceptions were verified. Startup heating was underway.
Live status subsequently confirmed plate 5 complete at 200/200 layers, no
exceptions and inactive virtual SD: 8962.36 s elapsed / 8364.16 s print time,
43225.23 mm reported filament use. Owner confirmed bed clear for plate 6.

Plate 6 (middle-left) was exported from the same GUI project as
`U1-SAMLA-open-plate6-middle-left-BLACK-T1.gcode`: 100 layers, 32.92 g /
11036.25 mm / 26.55 cm3, estimated 38m 18s plus startup. Same process settings,
220 C nozzle / 65 C bed and T1 only were verified. All four corner 30% modifiers
were retained; the middle-left source object has no local modifier. Bounds
including 484 arcs: X 85-185 mm, Y 1-220.74 mm, Z 0.2-20.45 mm. Uploaded
958990 bytes matched SHA256
`ce72debefad313ebda616bc31e09f47cfdcf1db73878416276de7aa279f0b931`.
Fresh consumption and mapping were set and read back before start; exact
filename, printing, active virtual SD and no exceptions confirmed acceptance.
A subsequent live check confirmed complete at 100/100 layers, no exceptions,
inactive virtual SD: 2893.19 s elapsed / 2299.63 s print time, 11033.05 mm
reported filament use. Owner confirmed plate 6 finished and bed clear.

Plate 7 is the final connecting-pin plate, with nine source objects retaining
their original 20% object-level infill overrides. Exported from the same GUI
project as `U1-SAMLA-open-plate7-pins-BLACK-T1.gcode`: 75 layers, 55.25 g /
18524.07 mm / 44.56 cm3, estimated 1h 15m 34s plus startup. Same global process
settings, T1 only, 220 C nozzle / 65 C bed; automatic brim enabled but none
generated for this plate. Geometry, orientation and existing local settings
were preserved. Bounds including 9 arcs: X 85-185.49 mm, Y 1-173.227 mm,
Z 0.2-15.45 mm. Uploaded 2529834 bytes matched SHA256
`5aec29cb72580066e6afbee217a24cb83db187f07a51e2c24b630994b2a71c33`.
Fresh per-job consumption, physical toolhead 2 black SnapSpeed PLA, healthy
loaded feed, enabled filament sensor, mapping [[1,1]], and bed leveling were
verified before start. Start returned `result: ok`; exact filename, `printing`,
active virtual SD, `extruder1`, and no exceptions were confirmed. Startup
heating was underway. A later live check confirmed the final plate complete at
75/75 layers with no exceptions, inactive virtual SD and heaters off:
5229.42 s elapsed / 4629.07 s print time, 18520.86 mm reported filament use.
The owner reports the cover fits nicely. All seven plates are complete;
operation with the assembled cover has not yet been validated.

Technical reference for per-job parameter handling:
[Snapmaker U1 Klipper print task config](https://github.com/Snapmaker/u1-klipper/blob/main/klippy/extras/print_task_config.py).
