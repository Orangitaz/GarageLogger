# Changelog

Each release has a number: **major.minor.patch**. A new feature raises the minor number (1.1.0), a fix raises the patch number (1.0.1), and a big change that needs your attention raises the major number (2.0.0). The number is in the `VERSION` file, shows at the bottom of **Settings & data** in the app, and is a tag on the Docker image (for example `ghcr.io/orangitaz/garagelogger:1.0.0`), so you can always tell which version is running.

## 1.4.0 - 2026-10-18
- **Several part numbers per category.** In the Parts list, each category can hold more than one number or brand (one per line), with **+ Add another** under it and an ✕ on each line. **Add part** to an existing category now adds another line instead of replacing it. The garage card shows the first one and "+2" when there are more.

## 1.3.0 - 2026-10-18
- **Standalone Android app.** The app can now carry Garage Log inside it and keep its data on the phone with no server. A server address is optional and can be added in Settings & data, which syncs and merges like the web version. Backups, CSV and service history go to the Android share sheet.
- Server: accepts requests from the Android app (only from the app's own address, or ones listed in `CORS_ORIGINS`). Photos and documents can be read with the same private key as the calendar link, so the app can show them when a password is set.

## 1.2.0 - 2026-10-17
- Parts used on a service now has two clear buttons: **+ Bought for this job** (typed part, inventory unchanged) and **− Take from inventory** (deducts stock). Restock leftovers from the Inventory tab when the job is done.

## 1.1.0 - 2026-10-17
- **Log again** on every service, repair and upgrade: a new entry with the same work, parts, inventory use and interval, ready for a new date and reading.
- **Snooze** on reminders (1 or 2 weeks, 1 or 3 months, or push the reading back). Counts from today if it is overdue, with Undo.
- **Quick odometer / hours**: tap the reading on a garage card, or the + button on the dashboard, for a one-field dialog.
- **Quick jobs remember parts**: tick "Save as a quick job" when logging a service. Its parts and inventory use fill in next time you pick it.
- Forms open as bottom sheets on phones.
- **Calendar link** (Settings & data): subscribe to reminders and expiration dates from Apple Calendar or an Android app.
- **Server backups** are listed in Settings & data and can be downloaded.
- **Sync dot** in the title bar (green saved, orange saving, red offline). Tap it for details.
- Home-screen shortcuts: long-press the app icon for Add service and Inventory.
- "Service history" is labeled Print / Save as PDF.
- Fixed: logging a service with inventory parts from a copied entry no longer skips the stock deduction.

## 1.0.0 - 2026-10-14
First numbered release. Everything below up to this point is rolled into it.
- Dashboard `+` asks what to add. Service form reordered; photo, receipt and cover-photo buttons; VIN next to the plate.
- Parts tab split into Info and Parts. More menu grouped into Records and Tools. Tab rows scroll away, only the title bar stays fixed.
- Undo for deleted entries and inventory items. Warning for an odometer reading lower than the last one. Reorder equipment on the garage screen.
- Registration, OHV sticker and other dates that fall on the same day show as one reminder.
- Removed the backup text box and the record count line.

## 0.6.0 - 2026-10-13
- Optional extra dates under registration (inspection, emissions, insurance).
- Documents (PDFs and photos) per piece of equipment, stored in the data folder.
- Archive equipment, restore or print it from Settings & data.
- `/api/summary` status feed for Home Assistant.

## 0.5.0 - 2026-10-13
- Repeating reminders (6 months, 1, 2, 3 years or custom) with Renew; registration and OHV sticker renewal, 2 years by default.
- Estimated due dates for mileage and hours reminders.
- Parts used can come out of inventory.
- Recall check by VIN (NHTSA), optional password, CSV export, "when did I last" search.

## 0.4.0 - 2026-10-13
- Daily backups (14 kept), photos stored as files, merge-safe sync between devices.
- Reminder alerts through ntfy, Home Assistant or Gotify; quick-pick services; printable service history.

## 0.3.0 - 2026-10-13
- Install as an app, offline start, log-service prompt after Mark done, backup download and restore, light and dark setting, low-stock badges, per-equipment due-soon window.

## 0.2.0 - 2026-10-13
- Redesign: modern dark glass look, equipment cards, dashboard per piece of equipment.

## 0.1.0 - 2026-10-10
- Original app: garage, service and repair records, reminders, inventory, parts lists, photos and receipts.
