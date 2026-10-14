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
   - Leave command, entrypoint and environment variables empty (the image already has them).
4. Click **Install** and wait for the app to show **Running**.
5. Open `http://TRUENAS-IP:30500` in a browser. Tap the menu on your phone's browser and choose **Add to Home screen** (or **Install app**). It opens full screen with its own icon.

If the app stops right away, open its **Logs**. A "permission denied" on `/data` means the dataset isn't writable by
user 568: on the dataset's **Permissions** screen set the owner to `apps` (568) and save.

## Check it works
- The page loads at `http://TRUENAS-IP:30500`.
- Add a vehicle, then open the same address on another device: it shows there too.
- A file named `db.json` appears in your dataset folder. That one file is your whole garage (photos included).
  Snapshot or replicate the dataset to back it up.

## Updating
Change the code, commit it, and let GitHub rebuild. Then on TrueNAS: Apps > garage-log > **Edit**, re-save
(or use the app's update/redeploy action) so it pulls the newest `latest` image. Your data stays in the dataset.

## Notes
- No login. Keep it on your home network or behind a VPN or reverse proxy.
- Change `30500` to any free port; the container always listens on 3000.
- No GitHub? Build on any PC with Docker: `docker build -t YOURUSER/garage-log .` then
  `docker push YOURUSER/garage-log` (Docker Hub), and use `YOURUSER/garage-log` as the image name.
