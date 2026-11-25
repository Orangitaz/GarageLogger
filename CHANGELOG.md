# Changelog

Each release has a number: **major.minor.patch**. A new feature raises the minor number (1.1.0), a fix raises the patch number (1.0.1), and a big change that needs your attention raises the major number (2.0.0). The number is in the `VERSION` file, shows at the bottom of **Settings & data** in the app, and is a tag on the Docker image (for example `ghcr.io/orangitaz/garagelogger:1.0.0`), so you can always tell which version is running.

## 1.26.0 - 2026-11-25
- 13 more equipment pictures: boat trailer, stand-up and sit-down jet ski, dirt bike, push mower, snow blower, leaf blower, string trimmer, chainsaw, pressure washer, garden tiller, hedge trimmer and lawn edger. There are now 33 to choose from in **Edit equipment > Picture**.
- The picture list is grouped (Cars & trucks, Off-road & snow, Trailers, Water, Mowers & yard tools) so it is quicker to scan.
- Nothing else changes: equipment types, default pictures per type and saved data are the same, and a picture is only stored when you pick one.

## 1.25.0 - 2026-11-21
- Equipment now has a 3D picture. Cars and trucks, off-road, trailers and lawn mowers each get a default picture (car, UTV, utility trailer, riding mower) on the garage cards and at the top of the equipment's dashboard. "Other" keeps its small icon. A cover photo you added yourself still comes first.
- **Edit equipment > Picture** lets you pick any of 20 pictures (car, pickup, SUV, motorcycle, RV, ATV, UTV, off-road UTV, snowmobile, golf cart, utility, flatbed, dump and enclosed trailers, horse trailer, travel trailer, boat, riding and zero-turn mowers, tractor) or leave it on Automatic. The choice is stored as a new optional `pic` field only when you pick one; equipment types, existing equipment and saved records are unchanged.
- Pictures are small WebP files in two sizes (the phone downloads the right one), have fixed dimensions so the page doesn't jump while they load, load lazily below the first screen, and are kept on the device after the first time. They sit on a light tile so they look right in dark mode too. The Android app bundles them.
- Known issue in the supplied artwork: a few windows (golf cart canopy, UTV and boat windscreens) show a faint checkerboard pattern that was baked into the images.

## 1.24.3 - 2026-11-20
- `PORT=0` now really means "pick a free port" (before, it fell back to 3000). Normal setups that leave `PORT` unset or set a number are unaffected.
- More browser checks: signing in with accounts on (wrong password, separate garages, a private receipt photo that shows for its owner and is refused for another person or someone signed out, and "sign out of every device"), barcode and VIN scanning (with a stand-in for the browser's reader: capitals and trimming, a leading "I" on an 18-character VIN, a photo with no barcode, and a browser with no reader), and backup and restore through the app's own buttons onto an empty server (the receipt photo inside the backup comes back as a real file, and a file that isn't a backup changes nothing).

## 1.24.2 - 2026-11-19
- The photo and document copy retry (1.24.1) can no longer end up with several retries running at once, and starts its waiting times over after it succeeds.
- While that copy is unfinished, the admin sees a note in Settings so it doesn't go unnoticed.
- New checks: a backup-and-restore check (whole data folder copied to a new place: sign-ins, data, photos and documents all come back, nobody can open anyone else's files, and a daily backup put back after an accidental delete restores the records), and browser checks for adding equipment, recording maintenance with a receipt, and two devices syncing and merging changes. The browser checks run as their own GitHub check.

## 1.24.1 - 2026-11-19
- Upgrading to per-person photo and document folders (first introduced in 1.23.0) is now only marked finished when every photo, receipt and document your data points to has been copied. Before, one failed copy (disk busy, out of space) could still mark it finished and it would never be retried.
- If anything fails, the server says so in its log, keeps serving the files from the old shared folders to the person they belong to, and retries by itself (after 1 minute, then 5, 15 and every hour) without a restart. A restart also retries.
- Copies are written to a temporary name, checked for size and then moved into place, so a half-copied file is never mistaken for a good one and is replaced on the next try.
- A person's data that can't be read at that moment is no longer treated as "no files"; it counts as a failure and is tried again.
- A file your data lists that no longer exists anywhere does not hold up the finish.

## 1.24.0 - 2026-11-19
- The app's single page file is split up. `index.html` is now a small page that loads `app.css` (styles), `lib.js` (shared logic) and `app.js` (screens, forms and syncing). Nothing looks or behaves differently.
- The shared logic (dates, text helpers and the merge used when two devices edit the same data) is now in `lib.js` and has its own checks, `tests/lib.test.js`, which run before every image build. The checks also make sure the files load together without clashing and that no version placeholder is left behind.
- The server sends the three files compressed and lets the browser re-check them cheaply, and the offline copy of the app now includes them, so the app still opens without a connection.
- The Android build bundles the new files (the Android build was updated first, so any build in between still works).
- The README has a short section on how the files fit together.

## 1.23.3 - 2026-11-19
- The checks in `tests/run.js` now start the server on a free port and wait until it is ready, instead of guessing a port and waiting a fixed time. One check had failed once at random on a busy machine. The app is unchanged.

## 1.23.2 - 2026-11-19
- The server now checks every save before writing it. Lists that must be lists (equipment, records, inventory, photos, extra dates, documents, checklists, tires), entries that must have an id, dates that must be real dates (`2027-02-31` and `2027-13-45` are refused), numbers, text fields and the alert settings are all checked. A bad save is answered with a clear message and nothing is changed; anything else in the data is kept as it is, so newer versions of the app keep working.
- Before, a bad value could be stored and later break things. For example, an extra date list that wasn't a list made the calendar and the Home Assistant status feed crash the whole server every time they were fetched. The calendar, status feed and alerts now skip broken entries instead, an error in one request can no longer stop the server, and broken data in `db.json` no longer stops it starting.
- When the server refuses a save, the sync log in Settings now says why.

## 1.23.1 - 2026-11-19
- Security: the address you save under Reminder alerts can no longer be used to reach other machines on your network. With accounts on, only the admin may use an internal address (for example a Home Assistant or ntfy server at 192.168.x.x); other accounts can only use public web addresses. Blocked ranges include local, private, Tailscale (100.64.x.x), link-local and cloud-metadata addresses, in every spelling (127.1, ::ffff:127.0.0.1 and so on), and a name that points inside is refused too. Redirects are never followed.
- To let everyone use an internal server, list it in the new `ALERT_HOSTS` setting (comma separated). Without accounts nothing changes.
- The Send test message button now works for every account (with the same rule), and non-admin accounts get one generic answer for any failure, so it can't be used to map the network.
- Alerts accept `https://user:password@host/` addresses now.

## 1.23.0 - 2026-11-19
- Security, accounts: photos and documents are now stored in each person's own folder (`users/<name>/photos` and `docs`) instead of shared top-level folders, and opening one needs that person's sign-in. Before, anyone who knew a file's address could open it without signing in. The address now carries a private link that is tied to the person, and it stops working when they change their password, sign out everywhere or are turned off. The view-only link still shows the owner's photos.
- On the first start, each person's existing files are copied into their folders automatically. The old shared folders are left in place and no longer served; delete them when you have checked your photos show.
- Update the Android app too (1.23.0 or newer): older versions of the app can't show photos from a server with accounts on.
- Without accounts nothing changes.
- Added tests for all of this to `tests/run.js`.

## 1.22.2 - 2026-11-17
- Fix: when the app is used on a phone without a server, its storage holds roughly 55 photos. After that a save failed without any message and the change was lost when the app closed. The app now warns you straight away, explains that the change was not saved, and tells you to download a backup and remove some photos or add a server. With a server connected nothing changes.

## 1.22.1 - 2026-11-16
- Equipment tabs: Parts now sits right after Dashboard, and the Odometer (or Hours) tab moved into the More menu as "Odometer log" / "Hours log", since the dashboard already has a quick update for the reading. While you're in it, More stays highlighted. Time-only equipment has no log entry, as before.

## 1.22.0 - 2026-11-16
- Settings & data is tidier. The long list is now grouped into sections you tap to open: Look & units, Account & server, Alerts, calendar & sharing, Backup & restore, and (when you have any) Archived equipment. Help and the sync status stay at the top, and the sections you open stay open while you use the menu.

## 1.21.1 - 2026-11-16
- Security: the server now accepts only real JSON requests. Before, a web page on another site could post to a server with no password and turn on accounts without you knowing.
- Security: with accounts on, only the admin can use the "Test" button for alerts, because it contacts any address you type from the server.
- Security: added headers that stop the app being shown inside other sites and stop browsers guessing file types; `users.json` is now readable only by the app.
- Fix: a failed page load (for example "Password required") is no longer saved and shown later when you're offline.
- Fix: behind a reverse proxy, set the environment variable `TRUST_PROXY=1` so a lockout from wrong sign-in tries only affects the person who typed them, not everyone.
- Fix: calendar lines are folded by bytes, so names with emoji or accents are no longer split.
- Faster: the app page and your data are compressed, and the page isn't re-downloaded when it hasn't changed.
- The server also answers on IPv6 now.
- Added `tests/run.js` (run `node tests/run.js`) and it runs before each image build.

## 1.21.0 - 2026-11-10
- Accounts: Manage users shows when each person last signed in.
- Accounts: the admin can turn an account off and on. A turned-off account can't sign in, its calendar and view-only links stop and its reminder alerts pause, but its data is kept.
- Accounts: "Sign out everywhere" for each person (admin) and "Sign out of every device" in your own account settings, for a lost phone. Existing sign-ins stay valid when you update.

## 1.20.1 - 2026-11-06
- Cleanup: removed unused styles and code left over from earlier versions (the old equipment card layout, the old icon styling, an unused tap handler and two unused constants). Nothing looks or behaves differently; the app is a little smaller.

## 1.20.0 - 2026-11-06
- Removed the equipment icons and the icon picker. A tile and a dashboard now show the equipment's cover photo when it has one. With no photo, that picture area is hidden and the tile is just its name and status.
- Pickers ("Log a service for…", "Add to…") list the equipment by name only.

## 1.19.1 - 2026-11-03
- Security fix: on a server that has `GARAGE_PASSWORD` set, someone who could reach the server could have turned on accounts without knowing that password. Turning accounts on now needs the server password. If you use a server password and turned on accounts on 1.18.0 or 1.19.0, check Manage users for any account you don't recognize.
- Usernames like "constructor" no longer cause a server error at sign-in.
- Equipment in storage now shows its reminders as Paused instead of Overdue.
- README: accounts and storage are in the feature list, the Home Assistant status feed explains what to use when accounts are on, and the steps for going back from accounts to one shared garage are now accurate.
- Removed some stray test files that had been committed to the repository by mistake.

## 1.19.0 - 2026-10-31
- In storage mode. In an equipment's More menu, **Put in storage for the season** pauses its reminders: they leave the attention list, the alerts, the calendar link and the Home Assistant status. Registration, the OHV sticker and other expiration dates keep counting. Taking it out moves dated reminders later by the days it was stored, with Undo.
- Copy reminders and checklists from one piece of equipment to others (More menu). Intervals carry over, restarting from today or from the other equipment's latest reading; same-name items are skipped and Undo reverses it. Distance reminders are not copied onto hours-tracked equipment, or the reverse.
- A guide for using Garage Log away from home (Tailscale), in the README and in Help.

## 1.18.0 - 2026-10-27
- Optional user accounts. The admin turns them on in Settings, then adds people under Manage users. Everyone signs in with their own username and password and only sees their own equipment, photos, inventory, settings, backups, alerts and calendar feed. Your existing data becomes the admin account, and the original files are left untouched.
- Passwords are stored hashed, sign-ins last 90 days, changing or resetting a password signs that person out everywhere, and repeated wrong passwords lock the sign-in for 15 minutes. Removing a user keeps their files, set aside on the server.
- Signing out wipes that person's data from the device, and a different person signing in on a shared device never inherits the earlier person's data.
- The Android app has a Username box in its server settings for servers with accounts. Without accounts turned on, nothing changes and the optional server password still works.

## 1.17.3 - 2026-10-26
- Fixed Copy VIN on the Recalls card. It now works in the Android app and on plain http addresses, and if copying is blocked it shows the VIN in a box you can select.
- Removed the "I checked, mark today" button and the last-checked text from the Recalls card.

## 1.17.2 - 2026-10-25
- Better matching equipment icons: a real Jeep, a utility trailer, a dirt bike, a car on a trailer for the car hauler, and a quad-style icon for the ATV. They come from Material Design Icons, Font Awesome Free and game-icons.net (credits are in the README).

## 1.17.1 - 2026-10-25
- Equipment icons now come from the Material Design Icons library (Pictogrammers, Apache 2.0) instead of hand drawings: they are cleaner and consistent. Same choices as before, plus Tractor, Boat and Generator under Other. Icons still take the equipment's color.

## 1.17.0 - 2026-10-25
- **Pick an icon for each piece of equipment** (Edit equipment > Icon): car, pickup, SUV, van; ATV, UTV, dirt bike, Jeep; riding mower, push mower; camp trailer, utility trailer, car hauler; and tractor, boat or generator under Other. The icon takes the equipment's color. Existing equipment keeps a sensible default for its type.

## 1.16.2 - 2026-10-25
- The Settings button in the top corner is now a gear (⚙️) instead of three dots. It still opens Settings & data and shows the green dot when an update is available.

## 1.16.1 - 2026-10-24
- **Android back swipe:** the phone's back swipe or button now steps back inside the app (closes a sheet, then goes from equipment to My Garage) instead of leaving it. It leaves the app only from My Garage.
- Trailers now have a drawn trailer icon instead of a truck.

## 1.16.0 - 2026-10-23
- **Common reminders:** after adding equipment the app offers usual reminders for that kind (oil, filters, belts and so on). Tick the ones you want. Also available from the Reminders tab.
- **Share or print one record:** the edit form of a service, repair or upgrade has a button that makes a page for just that job, with photos and receipts.
- **Every month:** when adding a reminder, pick a month and it is set to repeat every year.
- **Connection log:** Settings & data now has a Connection log with the server address, a Test connection button, and recent sync events and errors.

## 1.16.0 - 2026-10-24
- **Back gesture:** swipe back or the phone's back button now closes a sheet or photo first, then goes from equipment back to My Garage, instead of leaving the app.
- **New look:** colorful emoji icons on tabs and menus, a full-width bottom bar with a label under each icon, and My Garage shown as two-column tiles with a color stripe, big icon and status.
- **Quick tiles** on My Garage: Add service, Odometer and Checklists (it asks which equipment).
- **Done and Snooze** are now right on each reminder row.
- **Update tile:** appears at the top of My Garage and in Settings only when a newer app version exists. The "you have the latest version" line is gone.
- Fixed: tapping exactly on an icon inside a button (such as the magnifier in "Last done…") did nothing.

## 1.15.1 - 2026-10-23
- Help: the Getting started topic lists every tab and the tools in the ⋯ menu, and the Needs-attention topic explains the Done and Snooze buttons.
- The + button next to Description in the service form is bigger and easier to tap.

## 1.15.0 - 2026-10-22
- **Needs attention** list: each item now has **Done** (or Renew) and **Snooze** buttons, so you can clear it without opening the equipment.
- **When did I last…** on My Garage searches every piece of equipment at once and shows when each last had that job or part. Tap a result to open that timeline.
- **Checklists:** optional suggested starters (Spring start-up, Winterize, Before towing and others for each kind of equipment). They are added as copies you can edit.
- **Backup:** Settings shows the date of your last downloaded backup file.

## 1.14.0 - 2026-10-22
- **Full app review:** no errors found. Tidied what turned up.
- The photo banner now shows only on the Dashboard instead of repeating on every tab.
- Timeline cards no longer repeat the date and odometer that the heading already shows.
- Easier to tap: See all, Edit, Reorder, Where-to-buy links and the small + in the service form.
- Large text sizes: the bottom bar and search box now fit the screen.

## 1.13.0 - 2026-10-22
- **Recalls:** the automatic recall list is gone. It listed every recall NHTSA has for the model year, not the ones open on your vehicle, so it didn't match the NHTSA site. The dashboard now has a Recalls card with **Open nhtsa.gov/recalls**, **Copy VIN**, and **I checked, mark today** (it remembers when you last checked). The weekly recall alerts are removed too.

## 1.12.0 - 2026-10-22
- **Details** (plate, VIN, registration and other dates) moved from the Parts tab to the bottom of the equipment's Dashboard. It shows the plate and VIN, with Show all for the dates and Edit. Parts now holds just the parts list.

## 1.11.2 - 2026-10-22
- **Log again** now shows only on services, not on repairs or upgrades.

## 1.11.1 - 2026-10-22
- Removed the duplicate Records list (Upgrades, Timeline, Odometer, Notes) from the More menu. Those are already tabs, so More now holds just the tools.

## 1.11.0 - 2026-10-21
- **Needs-attention banner** on My Garage (overdue, due soon, mileage updates) with a tap-through list.
- **Mileage nudge:** the dashboard asks for a fresh odometer or hours reading when the last one is a month old.
- **Warranty dates** on equipment and on service, repair and upgrade records (date and/or odometer). They become reminders.
- **Checklists** per piece of equipment (More > Checklists): make your own, tick them off, Finish stamps the date.
- **Tires** (More > Tires): tire sets, which is mounted, miles on each set, tread depth in 32nds.
- **Where to buy** (store name and link, no prices) on inventory items and parts-list categories.
- **Full history report** (More > Full history report): parts, dates, tires, documents and every record with photos and receipts, to print or save as PDF.

## 1.10.1 - 2026-10-21
- Android app: App updates moved to the bottom of Settings & data, just above the version number.
- The APK is now really signed with one fixed key, so new versions install over the old one.

## 1.10.0 - 2026-10-21
- **Progress bar on each garage card** for the next service ("2,100 of 5,000 mi until oil change"), for reminders created from a logged service.
- **One scrolling tab row with icons** inside equipment (Dashboard through Notes, then More), centered on the tab you're on.
- **One consistent icon set** (line icons) instead of mixed emoji, including the pencils, empty screens and camera button.
- **Cover photo placeholder** is a clean icon with "Tap to add a photo".
- **Reminders grouped** as Overdue, Due soon, Later and Done.
- After saving a record you stay where you were in the list, and a **Saved toast with Undo** appears.
- New record forms open with today's date and a blank odometer (on a computer the cursor starts in Description).

## 1.9.1 - 2026-10-21
- Reminder text no longer shows double brackets.
- Inventory: the small ✕ on each tile is gone; use Delete inside the item's edit form (with Undo).

## 1.9.0 - 2026-10-21
- **Timeline** of services, repairs and upgrades (More > Timeline) with filters and search.
- **Done by** on records; **templates** (Save as a template) and a remembered next-service interval per job.
- **Scan** a barcode with the camera for the VIN and inventory part numbers (where the phone supports it).
- **View-only share link** for family (needs a server password).
- **Text size** setting, bigger tap targets, light theme polish.
- Help & tips updated for all of the above.

## 1.8.2 - 2026-10-21
- Fixed the empty record lists showing a code (U0001F527) instead of the wrench icon.

## 1.8.1 - 2026-10-21
- Removed the Android app lock option (it did not work on the phone).

## 1.8.0 - 2026-10-21
- **Swipe on reminders:** swipe right to mark done (or renew), swipe left to snooze.
- **Search and filter** on every record list: a search box (notes, parts, dates) and chips for years, or Overdue / Upcoming / Done on reminders.
- **Photo viewer:** tap any photo or cover for full screen, swipe between photos, pinch or double-tap to zoom. Photos are shrunk before upload.
- **Odometer / hours chart** on that tab, with the yearly pace.
- **Accent color per piece of equipment** (Edit equipment > Color).
- **Friendlier empty screens**, smoother screen and sheet motion, and pull down to sync.
- **Help & tips** in Settings & data, with search.

## 1.7.0 - 2026-10-20
- **Android app tells you when an update is out.** A green dot appears on the ⋯ button, and Settings & data > App updates links straight to the new APK. The APK is now published as a GitHub Release automatically.

## 1.6.0 - 2026-10-20
- **Edit pencil on each tile.** Every service, repair, upgrade, reminder, note and odometer tile, every dashboard tile, every part category, every inventory item and every garage card has its own ✎ that opens just that item. The floating edit button inside equipment is gone.
- **Delete** moved inside the edit form (with Undo). On the Parts tab, **Edit** (Info) and **Reorder** (Parts) sit in the section headings.
- On the garage screen the floating button is now ⇅ and only reorders equipment.

## 1.5.0 - 2026-10-18
- **Several part numbers per inventory item.** Each item has a **Part numbers / brands** list (one per line, + Add another, ✕ to remove) shown on its card. Existing notes stay in **Notes**.

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
