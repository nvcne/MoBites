# MoBites: Food Delivery (HCI UI Project, G1)

A Filipino food delivery website with **Notepad (.txt) files as the database**.
It's presented from two points of view: a **guest** (not logged in) and a **member** (logged in).
A third, staff-only view, the **admin page**, runs the business side: orders, riders, staff, restaurants and menus.

## Run it

```bash
python server.py
```

Then open **http://127.0.0.1:5173**. Stop it with `Ctrl + C`.

> Don't double-click `index.html`. Browsers block a page from reading `.txt` files straight from your disk, so the site needs the server (or GitHub Pages).

| | Value |
|---|---|
| Demo login | **Pedro P. (Penduko) Dinorobo**: `pedro.dinorobo@email.com` / `Mobites#2026` |
| Admin login | Open **http://127.0.0.1:5173/#/admin** (or the **Admin** link in the footer): `admin@mobites.ph` / `Admin#2026` |
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
| About us: team names, role titles, photos | `data/team.txt`, with photos in `assets/img/team/` |
| Riders and office staff | `data/staff.txt` (or the admin page: **Riders & staff → Hire someone**) |
| Admin accounts | `data/admins.txt` (password stored as a SHA-256 hash) |

Every `.txt` file starts with `#` notes that explain its columns. To get a restaurant's `lat` and `lng`, right-click the place in Google Maps and click the coordinates to copy them.

## The admin page

Log in at `#/admin` with the admin account above. It has its own top bar and tabs (it's for the MoBites team, not customers).

| Tab | What you can do | File it changes |
|---|---|---|
| Dashboard | Today's orders and sales, free riders, orders by status, 7-day sales chart, top restaurants; assign riders to orders that need one | `orders.txt` |
| Orders | Search and filter every order, change its status, assign a rider, view details, take a **New order** by phone | `orders.txt` |
| Restaurants | Add, edit or remove a restaurant (pin it on the map), and add, edit or delete its dishes and bestseller tags | `restaurants.txt`, `menu.txt` |
| Riders & staff | **Hire** riders, dispatchers, support and operations staff; set them Active, Off duty or On leave; let go or rehire | `staff.txt` |
| Customers | Search customers and see their orders, total spent and points (passwords are never shown) | read only |
| Categories | Add a food category with an icon, or delete one no restaurant uses | `categories.txt` |

Safety rules built in: an order can't go **On the way** without a rider; a rider who is on a delivery can't be set off duty or let go; a restaurant with active orders can't be removed; cancelling, delivering, hiring, letting go and every delete ask for confirmation first.
When the admin changes an order's status, its `placed_at` is cleared, so the demo clock stops moving it and the admin's choice sticks.

## The Notepad database: how it works

```
data/restaurants.txt
# notes (ignored)
id|name|category|...          ← header row = column names
r01|Restaurant Name 01|rice-meals|...   ← one record per line, columns split by |
```

1. **Read:** the page downloads each `.txt` file, splits it into lines, then splits each line at `|` and matches the pieces to the header names (`js/db.js` → `parseTable`).
2. **Write:** when you sign up or place an order, the page sends the record to `server.py`, which **adds a new line** to `users.txt` or `orders.txt`. Cancelling an order **rewrites that line** (`status` → `cancelled`). The admin page adds, rewrites and **deletes** lines in the same way.
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
| Admin login is checked in the browser | Someone who knows JavaScript could skip the login screen | Fine for a class demo. A real app checks the login on the server before any change |
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
| 3+ tables, 10+ records each | `restaurants.txt` (12), `menu.txt` (36), `users.txt` (10), `orders.txt` (18), `staff.txt` (12), plus `categories.txt` (8), `team.txt` (5) and `admins.txt` (2) |
| Confirmation pop-ups | Log out, place order, empty the bag, cancel order, redeem points, remove a favorite, switch restaurants; admin: cancel/deliver an order, save a phone order, hire, let go, rehire, every delete, admin log out |

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
js/admin.js         admin pages (#/admin)
js/icons.js         outline icon set
assets/img/         photos (restaurants/ and menu/ for your own)
```
