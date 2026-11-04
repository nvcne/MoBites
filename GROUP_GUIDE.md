# MoBites: how to add restaurants and menus (for groupmates)

The site's database is the `.txt` files in `data/`. When you add a restaurant on your laptop, it's saved in **your** copy only. Pushing to GitHub is what shares it with everyone.

## First time only

1. Install **Git**, **Python** and **VS Code**.
2. Accept the GitHub invite to `nvcne/MoBites` (check your email).
3. In VS Code: **Ctrl + Shift + P** → **Git: Clone** → paste `https://github.com/nvcne/MoBites.git` → pick a folder → **Open**.

## Every time you add or edit

1. **Claim it first.** Post in the group chat which restaurant you're doing, so two people don't add the same one.
2. **Pull:** Source Control panel (left side) → **⋯** → **Pull**.
3. **Start the site:** **Terminal → New Terminal**, run `python server.py`, then open http://127.0.0.1:5173/#/admin
4. **Log in as admin:** `admin@mobites.ph` / `Admin#2026`
5. **Add it:** **Restaurants → Add restaurant**. Fill in the details, tap **Pin on map**, **Upload photo**, then **Add restaurant**. On the next screen, add its dishes (with photos).
6. **Stop the site:** click the terminal and press **Ctrl + C**.
7. **Commit only these:** `data/restaurants.txt`, `data/menu.txt`, `data/categories.txt` and the photos in `assets/img/`. If any other file shows up (orders, users, messages, feedback from testing), right-click it → **Discard Changes**.
8. Type a message like `Add Aling Nena's Carinderia` → **Commit** → **Sync Changes**.

Do steps 2 to 8 in one sitting. Pulling right before and pushing right after keeps everyone's restaurant IDs (`r01`, `r02`…) from clashing.

## No setup? Edit on github.com

- **Text:** open `data/restaurants.txt` or `data/menu.txt` on github.com → ✏️ pencil → edit → **Commit changes**. Keep one record per line, columns split by `|`. The `#` notes at the top of each file explain every column.
- **Photos:** open `assets/img/restaurants/` (or `menu/`) → **Add file → Upload files**. Then type the file name in that row's `image` column. Use lowercase names with no spaces (`r03.jpg`).

## Good to know

- Aim for **at least 10 restaurants and 10 dishes**. The project guideline needs 10+ records per table.
- Replacing a photo? Upload it with the **same file name**. If the old one still shows, press **Ctrl + F5**.
- If **Sync** says there's a conflict, don't guess. Message the group before doing anything.
- The live site (https://nvcne.github.io/MoBites/) updates a minute or two after a push.
