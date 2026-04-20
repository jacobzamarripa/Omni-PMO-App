# User-Facing Inventory: Status Pills & Flag Badges

This inventory is designed for non-technical review to determine which elements should be kept, merged, or redesigned.

## 1. Primary Status Pills
These are the large, colorful oval badges that define the overall state of a project. They are seen in the **Grid**, **Dashboard**, and **Quick Peek**.

| Visual Style | Label (Example) | Context / Meaning | Current CSS Class |
| :--- | :--- | :--- | :--- |
| 🔵 **Blue** | `Field CX`, `In Progress` | Active construction phase. | `chip-active` |
| 💠 **Cyan** | `Permit`, `Pre-Con`, `Vendor Assignment` | Early stage; not yet in construction. | `chip-permit` |
| 🟢 **Green** | `Complete` | Project is finished. | `chip-complete` |
| 🔵 **Dark Blue** | `OFS`, `Open For Sale` | Final state; project is live. | `chip-ofs` |
| ⚪ **Grey** | `On Hold`, `Hold` | Work is paused. | `chip-hold` |
| 🟣 **Purple** | `Vendor`, `DRG` | Vendor-specific tracking status. | `chip-drg` |
| 🟡 **Yellow** | `Admin` | Needs office review (Crossings, Status sync). | `chip-admin` |
| 🔘 **Ghost** | `Missing Report` | No data received for today. | `chip-ghost` |

---

## 2. Health & Diagnostic Flags (Badges)
These are smaller badges, often seen inside cards or on project rows, that highlight specific anomalies.

### 🚨 Critical & Risk Flags (Red/Warning)
| Flag Label | Icon / Prefix | Meaning to User | Visual Class |
| :--- | :--- | :--- | :--- |
| `MISSING QB STATUS` | 🚩 | Critical missing data in QuickBase. | `critical` |
| `STATUS MISMATCH` | 🚩 | Vendor reporting work, but QB says it's not construction. | `review` |
| `LIGHTING RISK` | - | Target date is very close but cabinet isn't lit. | `warn` |
| `INVALID FUTURE DATE`| - | Date entry error (too far in future). | `warn` |
| `GHOST UG/AE/FIBER` | - | Production reported with 0 crews/drills listed. | `warn` |

### 🟡 Admin & Discrepancy Flags (Amber/Yellow)
| Flag Label | Icon / Prefix | Meaning to User | Visual Class |
| :--- | :--- | :--- | :--- |
| `ADMIN: CHECK CROSSINGS` | 🚩 | Someone needs to verify special crossings (RR, Hwy). | `admin` |
| `BOM DISCREPANCY` | - | Vendor BOM doesn't match QB BOM. | `mismatch` |
| `TRACKER VARIANCE` | - | Vendor's own tracker doesn't match their daily report. | `mismatch` |
| `POSSIBLE REROUTE` | - | Production reported on a phase with 0 feet of BOM. | `mismatch` |

### 🪄 "Magic" & Info Flags (Purple/Violet)
| Flag Label | Icon / Prefix | Meaning to User | Visual Class |
| :--- | :--- | :--- | :--- |
| `ID AUTO-CORRECTED` | 🪄 | The system fixed a typo in the Project ID. | `magic` |
| `TRACKER UPDATE` | 📡 | Suggestion to update progress based on vendor tracker. | `magic` |
| `TRANSPORT OVERRIDE`| - | Project can be lit early due to transport availability. | `magic` |

---

## 3. Timeline & Activity Flags
These indicate the "freshness" of the reporting.

| Flag Label | Visual Style | Context |
| :--- | :--- | :--- |
| `STALE REPORT` | Muted Text | Last report was more than 1 business day ago. |
| `MISSING DAILY REPORT` | Ghost Style | No report received today for an active project. |
| `OFS (Inferred)` | Blue Tint | The system thinks it's done based on signals, but QB doesn't. |

---

## 4. Key Questions for Determination
1. **Redundancy:** Do we need both `MISSING QB STATUS` and `STATUS MISMATCH`, or can they be merged into a single `🚩 QB DATA ERROR`?
2. **Iconography:** Should we remove literal emojis (🚩, 🪄) from the labels now that we have distinct CSS colors?
3. **Ghosting:** Is the `MISSING DAILY REPORT` ghost style clear enough, or should it use a more distinct color?
4. **Admin Consolidation:** Should `ADMIN: CHECK CROSSINGS` be a pill or a flag? (It currently appears as both in different parts of the UI).
