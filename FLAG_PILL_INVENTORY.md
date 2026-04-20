# Final Technical Inventory: Flags and Status Pills (Post-Consolidation)

This document reflects the simplified and hardened logic for flags and status pills.

## 1. Health & Diagnostic Flags
Rendered as badges via `src/_render_flag_badge.html`.

| Display Name | Severity | Mapping logic (Frontend) | Meaning / Trigger |
| :--- | :--- | :--- | :--- |
| `STAGE MISMATCH` | `critical`/`warn` | `chip-warn` | QB Stage/Status is missing, or vendor work doesn't match QB Stage. |
| `MISSING BOM` | `critical` | `tag-red` | Activity reported but QB BOM qty is 0 for that phase. |
| `BOM DISCREPANCY` | `warn` | `chip-anomaly` | Vendor reported BOM !== QB BOM (where both > 0). |
| `BOM OVERRUN` | `critical`/`warn`| `chip-anomaly` | Total production > 105% of BOM. |
| `INFERRED STATE` | `magic` | `chip-magic` | Project missing from QB; state determined by production signals. |
| `MISSING DAILY REPORT`| `critical` | `chip-ghost` | Active project (In Progress) with prior history where report date has passed. |

## 3. Hardened Logic Gates

### 'Missing Daily Report' Suppression
A report is **NOT** considered missing if any of the following are true:
1. **No History:** Project has never submitted a daily report in the archive.
2. **Not Started:** The `CX Start` date (actual or inferred) is in the future.
3. **Not Active:** The QB Stage is not Field CX/Construction, or Status is not In Progress.
4. **Terminal:** Project is OFS, Complete, or On Hold.

### Actionable BOM Diagnostics
1. **MISSING BOM:** Only flags if `daily footage > 0` AND `BOM == 0`.
2. **BOM DISCREPANCY:** Only flags if both vendor and QB have non-zero values that don't match.
3. **BOM OVERRUN:** Flags if cumulative production exceeds 105% of BOM.
