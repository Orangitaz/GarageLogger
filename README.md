# Garage Log - container image for TrueNAS

One image, one port, one data folder. No YAML needed.

## Part 1: Build the image (once, about 3 minutes, free)

1. Sign in at github.com and create a new repository named `garage-log` (private or public).
2. Upload everything in this folder to it. Keep the `.github` folder (drag the whole folder in).
3. Open the repo's **Actions** tab. The "Build and publish image" run starts by itself. If it doesn't,
   choose it on the left and click **Run workflow**. Wait for the green check.
4. Make the image public so TrueNAS can pull it without a login:
   your GitHub profile > **Packages** > `garage-log` > **Package settings** > **Change visibility** > Public.
   (The image holds only the app, never your data, so public is fine.)
5. Your image name is `ghcr.io/YOUR-GITHUB-USERNAME/garage-log` (all lowercase), tag `latest`.

## Part 2: Install on TrueNAS (Community Edition)

1. **Make the data folder.** Storage > your pool > create a dataset, for example `apps/garage-log-data`.
2. **Apps > Discover Apps > Custom App.**
3. Fill in the form (labels can differ slightly between TrueNAS versions):
   - **Application name:** `garage-log`
   - **Image repository:** `ghcr.io/YOUR-GITHUB-USERNAME/garage-log`
   - **Image tag:** `latest`
   - **Run as user/group (if shown):** user `568`, group `568`
   - **Port:** container port `3000`, host (node) port `30500`, protocol TCP
   - **Storage:** add a **Host Path** volume. Host path = your dataset (for example `/mnt/YOURPOOL/apps/garage-log-data`),
     mount path = `/data`. If you see an **Automatic Permissions** checkbox, tick it.
   - Leave command and entrypoint empty. Environment variables are optional: `GARAGE_PASSWORD` turns on a password (see below).
4. Click **Install** and wait for the app to show **Running**.
5. Open `http://TRUENAS-IP:30500` in a browser. Tap the menu on your phone's browser and choose **Add to Home screen** (or **Install app**). It opens full screen with its own icon.

If the app stops right away, open its **Logs**. A "permission denied" on `/data` means the dataset isn't writable by
user 568: on the dataset's **Permissions** screen set the owner to `apps` (568) and save.

## Check it works
- The page loads at `http://TRUENAS-IP:30500`.
- Add a vehicle, then open the same address on another device: it shows there too.
- A file named `db.json` appears in your dataset folder. That one file is your whole garage (photos included).
  Snapshot or replicate the dataset to back it up.

## What's in the data folder
- `db.json` holds your records. `db.json.bak` is the version before the last save.
- `backups/` keeps one copy of `db.json` per day for the last 14 days. To roll back, stop the app, copy a file over `db.json`, and start it again.
- `photos/` holds every cover photo, record photo and receipt as its own file. Existing photos are moved here automatically the first time the new version starts, and a copy of the old `db.json` is kept in `backups/db-before-photo-move.json`.
- Two phones or tablets can edit at once. If one is out of date when it saves, the app merges the changes by item instead of overwriting the other device.

## Reminder alerts (optional)
In the app go to **⋯ > Settings & data > Reminder alerts** and paste a web address the server can send to:
- ntfy: `https://ntfy.sh/your-private-topic` (choose "ntfy / text"), then subscribe to that topic in the ntfy app.
- Home Assistant: a webhook URL (choose "JSON webhook"). The message arrives as `title` and `message`.
- Gotify: `https://your-gotify/message?token=APP_TOKEN` (choose "JSON webhook").

Press **Send test message** to check it. The server then sends a message once a day at the time you pick, only when something has newly become due soon or overdue, and again weekly while it stays overdue. The server needs to be able to reach the address (a home server on your network works; ntfy.sh needs internet access).

## Repeating reminders, registration and the OHV sticker
- On any reminder, **Repeats** can be every 6 months, 1 year, 2 years, 3 years, or a custom number of months. Repeating reminders show **Renew** instead of Mark done. Renew marks it done and creates the next one, with the date filled in for you to adjust.
- Equipment has a **Registration expiration** (not for mowers) and offroad equipment has an **OHV sticker expiration**. Each has its own renewal interval, set to 2 years by default. They show on the dashboard with a **Renew** button and are included in the alerts.
- Reminders that come due by miles or hours show an estimated date, worked out from how fast your odometer or hour readings have been climbing (needs readings on at least two dates, two weeks or more apart).

## Parts from inventory, search and export
- In a service, repair or upgrade, **Take from inventory** subtracts what you used from your inventory. Editing or deleting the entry puts the difference back.
- **Last done** on the dashboard searches descriptions, parts and notes and shows when and at what reading it was last done.
- **Export records (CSV)** is under **⋯ > Settings & data** (all equipment) and in each equipment's **More** menu (that one only).

## Recalls (optional, needs internet on the server)
Put the VIN on a car or truck and Garage Log asks the US government's NHTSA recall database about it once a week. It looks up the year, make and model from the VIN and lists the recalls NHTSA has for that model year, so the list can include recalls already fixed on your vehicle. Confirm with your VIN at nhtsa.gov/recalls, then tap **Mark handled** on any that are done. New recalls also go to your reminder alert address if you set one. **More > Check for recalls (VIN)** checks right away.

## Password (optional)
Set an environment variable `GARAGE_PASSWORD` on the app (TrueNAS: Edit > Environment Variables). The browser then asks for a password (any user name) before showing the app, your data or photos. Without it the app is open to anyone who can reach the port. The password is sent in a form that is only protected when you use the app through HTTPS (a reverse proxy) or a VPN, so it keeps casual visitors out on a home network but is not a substitute for those.

## Updating
Change the code, commit it, and let GitHub rebuild. Then on TrueNAS: Apps > garage-log > **Edit**, re-save
(or use the app's update/redeploy action) so it pulls the newest `latest` image. Your data stays in the dataset.

## Notes
- No login unless you set `GARAGE_PASSWORD`. Keep it on your home network or behind a VPN or reverse proxy.
- Change `30500` to any free port; the container always listens on 3000.
- No GitHub? Build on any PC with Docker: `docker build -t YOURUSER/garage-log .` then
  `docker push YOURUSER/garage-log` (Docker Hub), and use `YOURUSER/garage-log` as the image name.
