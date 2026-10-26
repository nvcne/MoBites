# MoBites: Food Delivery (HCI UI Project, G1)

A Filipino food delivery website with **Notepad (.txt) files as the database**.
It's presented from two points of view: a **guest** (not logged in) and a **member** (logged in).

## Run it

```bash
python server.py
```

Then open **http://127.0.0.1:5173**. Stop it with `Ctrl + C`.

> Don't double-click `index.html`. Browsers block a page from reading `.txt` files straight from your disk, so the site needs the server (or GitHub Pages).

| | Value |
|---|---|
| Demo login | `juan.delacruz@email.com` / `Mobites#2026` (or click **Fill demo account**) |
| Promo code | `MOBICNE`: ₱50 off orders of ₱300 or more |
| Test card | `4242 4242 4242 4242`, any future expiry (e.g. `12/29`), any CVC |

## Where to edit the restaurants (templates)

| What | Where |
|---|---|
| Restaurant name, category, area, map location, fee, rating, photo | `data/restaurants.txt` |
| Menu: dish name, description, price, photo, bestseller | `data/menu.txt` (`restaurant_id` links each dish to a restaurant) |
| Categories (name and icon) | `data/categories.txt` |
| Restaurant photos | Put the file in `assets/img/restaurants/`, then type its name in the `image` column (e.g. `r01.jpg`) |
| Dish photos | Put the file in `assets/img/menu/`, then type its name in the `image` column |
| Hero photo on the landing page | `assets/img/hero.jpg` (replace the file, keep the name) |

Every `.txt` file starts with `#` notes that explain its columns. To get a restaurant's `lat` and `lng`, right-click the place in Google Maps and click the coordinates to copy them.

## The Notepad database: how it works

```
data/restaurants.txt
# notes (ignored)
id|name|category|...          ← header row = column names
r01|Restaurant Name 01|rice-meals|...   ← one record per line, columns split by |
```

1. **Read:** the page downloads each `.txt` file, splits it into lines, then splits each line at `|` and matches the pieces to the header names (`js/db.js` → `parseTable`).
2. **Write:** when you sign up or place an order, the page sends the record to `server.py`, which **adds a new line** to `users.txt` or `orders.txt`. Cancelling an order **rewrites that line** (`status` → `cancelled`).
3. **Without the server** (e.g. on GitHub Pages), the site still reads the `.txt` files, but new records are kept in the browser. The **Download orders.txt** button on the Orders page saves them as a real Notepad file.

**Presentation tip:** place an order, then open `data/orders.txt` in Notepad. The new order is on the last line. Notepad doesn't refresh on its own, so close and reopen the file to see changes.

### Weak points of a .txt database, and how this project handles them

| Weak point | What can go wrong | What we did |
|---|---|---|
| No locking | Two saves at the same moment can overwrite each other | `server.py` lets only one write happen at a time |
| No "all-or-nothing" saves | A crash mid-save leaves a half-written file | Updates are written to a temp file first, then swapped in |
| Separator inside the data | An address with a `\|` in it shifts every column after it | `\|` and line breaks are stripped from every value before saving |
| Hand-editing mistakes | A missing `\|` or extra column breaks that record | Bad lines are skipped, and the browser console warns you which line it was |
| Encoding | Old Notepad "ANSI" encoding garbles `₱` and `ñ` (Parañaque) | Files are UTF-8, and the reader handles BOM and CRLF line endings. Always save as **UTF-8** |
| Everything is text | `"149"` is text, not a number | Number columns are converted when the files are read |
| No relationships | Deleting a restaurant leaves orders that point to it | Orders show "Removed restaurant" instead of crashing |
| Anyone can read the files | On GitHub Pages, `yoursite/data/users.txt` is public | Passwords are stored as **SHA-256 hashes**, never as plain text. Still, only use fake accounts |
| Speed | Every read loads the whole file | Fine for hundreds of rows, but a real app would need a real database |
| Caching | The browser may show an old copy of a file you just edited | `server.py` tells browsers not to cache the `.txt` files |

## Guideline checklist

| Requirement | Where |
|---|---|
| One theme | Palette `#642c8c` purple, `#fadd56` yellow, `#f2c983` tan, cream background; Nunito font everywhere |
| Consistent navigation | Same top bar (with **Deliver to**) on every page; bottom tab bar on phones |
| One icon style | `js/icons.js`, all outline |
| Gallery/list | Restaurant grid, menu, order history |
| Form with validation | Sign up (11-digit PH number, password strength, terms), Login, Checkout (address pin, phone, GCash/card), Profile |
| Chart / progress | Monthly ₱ spending chart, delivery progress bar, rewards progress, level ring |
| Status colors | Pending (yellow) · Preparing (tan) · On the way (purple) · Delivered (green) · Cancelled (red) |
| Phone-friendly | Tested at 375px wide; bottom tab bar under 768px |
| 3+ tables, 10+ records each | `restaurants.txt` (12), `menu.txt` (36), `users.txt` (10), `orders.txt` (12), plus `categories.txt` (8) |

## Location pinning

**Deliver to** opens a map (Leaflet + OpenStreetMap, free and open source):
- search an address (Nominatim, Philippines only),
- tap **Use my location** (GPS), or
- drag the map so the pin sits on your door. The street and barangay are filled in automatically.

Restaurants then show their distance in km, and Explore can sort by **Nearest**. Nominatim allows about 1 lookup per second, and the app waits between requests to stay within that.

## Files

```
index.html          app shell
server.py           local server that reads/writes the .txt database
data/*.txt          the Notepad database
css/styles.css      theme and layout
js/db.js            .txt reader/writer
js/app.js           pages, navigation, forms, map picker
js/icons.js         outline icon set
assets/img/         photos (restaurants/ and menu/ for your own)
```
