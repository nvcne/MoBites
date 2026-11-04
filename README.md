# MoBites: Food Delivery (HCI UI Project, G1)

A Filipino food delivery website with **Notepad (.txt) files as the database**.
It's presented from two points of view: a **guest** (not logged in) and a **member** (logged in).
Two staff-only views run the business side: the **rider app** (accept, pick up and deliver orders, chat with customers)
and the **admin page** (live orders, riders and staff, restaurants and menus, refunds, feedback).

## Run it

```bash
python server.py
```

Then open **http://127.0.0.1:5173**. Stop it with `Ctrl + C`. To use another port: `python server.py 8000`.

> After pulling new code, **stop and start `server.py` again**. A server that was already running keeps the old rules (for example, it won't save chat messages or photos).

> Don't double-click `index.html`. Browsers block a page from reading `.txt` files straight from your disk, so the site needs the server (or GitHub Pages).

| | Value |
|---|---|
| Demo login | **Pedro P. (Penduko) Dinorobo**: `pedro.dinorobo@email.com` / `Mobites#2026` |
| Rider login | Open **#/rider** (or **Riders** in the footer): **Juan Dela Cruz**: `juan.delacruz@mobites.ph` / `Rider#2026` |
| Admin login | Open **#/admin** (or **Admin** in the footer): `admin@mobites.ph` / `Admin#2026` |
| Demo inbox | **#/inbox**: copies of every email the site sends (codes, receipts), for when real email isn't set up |
| Promo code | `MOBICNE`: ₱50 off orders of ₱300 or more |
| Test card | `4242 4242 4242 4242`, any future expiry (e.g. `12/29`), any CVC. Add it under **My account → Payment methods** |
| GCash / Maya MPIN | Any 4 digits (it's a pretend approval screen) |

These are the **only** accounts that can log in: one per role, each with its own password. The other sample customers and staff are there to fill the tables, so their password column is blank and they can't log in or reset a password. Riders hired from the admin page get their own temporary password.

## Where to edit the restaurants

Groupmates: see **[GROUP_GUIDE.md](GROUP_GUIDE.md)** for the step-by-step way to add restaurants and menus and share them.

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
| Restaurant and dish photos (easier way) | Admin page → Restaurants → Edit → **Upload photo**. It's resized and saved into `assets/img/` for you |

Every `.txt` file starts with `#` notes that explain its columns. To get a restaurant's `lat` and `lng`, right-click the place in Google Maps and click the coordinates to copy them.

## Real email (EmailJS)

Sign-up codes, password changes, account deletion, refunds, order changes and new-rider logins are all emailed. Until you set this up, they only go to the **demo inbox** (`#/inbox`), and the site tells you so.

1. Make a free account at **https://www.emailjs.com** (200 emails a month).
2. **Email Services → Add New Service →** Gmail. Connect the email you want to send from. Copy the **Service ID**.
3. **Email Templates → Create New Template.** Set:
   - **To Email:** `{{to_email}}`
   - **Subject:** `{{subject}}`
   - **Content:** `{{message}}`

   Save it and copy the **Template ID**.
4. **Account → General:** copy your **Public Key**.
5. Paste all three into `js/email-config.js`, save, and refresh the site.

The public key is meant to be visible in website code. To stop other sites from using it, add your site's address under **Account → Security → Allowed origins** in EmailJS.

## What customers can do (member view)

| Feature | How it works |
|---|---|
| Sign up with email check | Name must be letters only. We email a 6-digit code; the account is saved only after the code is entered, then a "building your account" screen plays |
| Log in safely | 5 wrong passwords lock that login for 60 seconds; a warning shows when Caps Lock is on; **Forgot password** emails a reset code |
| Change password / delete account | Both ask for your current password, then a confirmation pop-up, then a code from your email. Nothing changes until the code is entered |
| Contact numbers | The main number (from sign-up) can't be changed. You can **add** up to 3 extra numbers and pick which one the rider calls |
| Food allergies | Pick them at sign-up or in My account. Checkout passes them to the restaurant and rider, highlighted in red |
| Pay like FoodPanda/Grab | Save payment methods once in **My account → Payment methods**: link GCash or Maya (with an email code) or add a card. Checkout only offers what you've saved. Wallets show an MPIN approval screen; cards keep only the last 4 digits. Cash on delivery can tell the rider which bill you'll pay with |
| Refunds | Cancelling a paid order starts a refund (shown on the order and emailed). The admin marks it done |
| Track with a PIN | The tracking page shows the rider, a 4-digit **delivery PIN** (the rider needs it to finish), and a **chat** with the rider |
| Feedback | `#/feedback`: stars, topic, message. Saved in `feedback.txt` and shown to the admin |
| Pop-ups and forms survive a refresh | Reload while a pop-up is open and it opens again. Half-typed forms come back (never passwords or card numbers). Live updates never close a pop-up |

## The rider app

Log in at `#/rider`. A rider goes **online**, sees new orders (nearby first), and taps **Accept**. Then:
1. **Pick up:** tick every item on a checklist before confirming.
2. **Deliver:** enter the customer's 4-digit PIN (and confirm the cash was collected for cash orders).
3. **Chat or call** the customer at any time. Messages are saved in `data/messages.txt`, so the rider and customer can be on different devices.

The rider can't go offline in the middle of a delivery, and gets a warning before logging out with one. If no rider accepts an order within 90 seconds, a pretend "auto rider" takes over (pending → preparing at 20s, on the way at 90s, delivered at 140s), so a member-only demo still finishes.

## The admin page

Log in at `#/admin` with the admin account above. It has its own top bar and tabs (it's for the MoBites team, not customers).

| Tab | What you can do | File it changes |
|---|---|---|
| Dashboard | Today's orders and sales, free riders, orders by status, 7-day sales chart, top restaurants; assign riders to orders that need one | `orders.txt` |
| Live orders | A board of New / Preparing / On the way / Delivered orders that updates every few seconds. New orders flash and beep; orders over 40 minutes turn red | read only |
| Orders | Search and filter every order, change its status, assign a rider, **edit** an active order (items, address, payment, rider, note), finish **refunds**, read the rider–customer chat, take a **New order** by phone | `orders.txt` |
| Restaurants | Add, edit or remove a restaurant (pin it on the map, **upload a photo**), and add, edit or delete its dishes (with photos) and bestseller tags | `restaurants.txt`, `menu.txt`, `assets/img/` |
| Riders & staff | **Hire** riders, dispatchers, support and operations staff (new riders get a temporary password by email); set them Active, Off duty or On leave; let go or rehire | `staff.txt` |
| Customers | Search customers and see their orders, total spent and points (passwords are never shown) | read only |
| Categories | Add a food category with an icon, or delete one no restaurant uses | `categories.txt` |
| Feedback | Read customer feedback, filter by topic or unread, see the average rating, mark as read | `feedback.txt` |

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
3. **Live updates:** pages that change on their own (order tracking, chat, rider app, live orders) re-read their `.txt` files every few seconds, and every page change re-reads them too. That's how one browser sees what another one saved.
4. **Without the server** (e.g. on GitHub Pages), the site still reads the `.txt` files, but new records are kept in the browser. The **Download orders.txt** button on the Orders page saves them as a real Notepad file. Chat then only works between tabs of the same browser.

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
| Admin and rider logins are checked in the browser | Someone who knows JavaScript could skip the login screen | Fine for a class demo. A real app checks the login on the server before any change |
| Payment details | Card numbers in a public text file would be a disaster | Saved payment methods stay in the customer's browser, and cards keep only the last 4 digits. Orders store `card-4242`, never the card number |
| Email codes | Codes in a text file could be read by anyone | Codes are kept only as SHA-256 hashes in the browser tab, expire after 10 minutes, and allow 5 tries |
| Speed | Every read loads the whole file | Fine for hundreds of rows, but a real app would need a real database |
| Caching | The browser may show an old copy of a file you just edited | `server.py` tells browsers not to cache the `.txt` files |

## Guideline checklist

| Requirement | Where |
|---|---|
| One theme | Palette `#642c8c` purple, `#fadd56` yellow, `#f2c983` tan, cream background; Nunito font everywhere |
| Consistent navigation | Same top bar (with **Deliver to**) on every page; bottom tab bar on phones |
| One icon style | `js/icons.js`, all outline |
| Gallery/list | Restaurant grid, menu, order history |
| Form with validation | Sign up (letters-only name, 11-digit PH number, password strength, email code), Login (lockout, Caps Lock), Checkout, Add card (Luhn check, expiry), Profile, Change password, Feedback, Hire, Restaurant/dish forms |
| Chart / progress | Monthly ₱ spending chart, delivery progress bar, rewards progress, level ring |
| Status colors | Pending (yellow) · Preparing (tan) · On the way (purple) · Delivered (green) · Cancelled (red) |
| Phone-friendly | Tested at 375px wide; bottom tab bar under 768px |
| 3+ tables, 10+ records each | `users.txt` (10), `staff.txt` (12), `restaurants.txt` and `menu.txt` (being filled in by the group: aim for 10+ each), plus `categories.txt` (8), `team.txt` (5) and `admins.txt` (1). `orders.txt`, `messages.txt` and `feedback.txt` start empty and fill up as people use the site |
| Confirmation pop-ups | Log out, place order, wallet payment, empty the bag, cancel order, redeem points, remove a favorite, switch restaurants, change password, delete account, remove a number or payment method; rider: accept, pick up, deliver, log out; admin: cancel/deliver/edit an order, refund done, save a phone order, hire, let go, rehire, remove a photo, every delete, admin log out |

## Location pinning

**Deliver to** opens a map (Leaflet + OpenStreetMap, free and open source):
- search an address (Nominatim, Philippines only),
- tap **Use my location** (GPS), or
- drag the map so the pin sits on your door. The street and barangay are filled in automatically.

Restaurants then show their distance in km, and Explore can sort by **Nearest**. Nominatim allows about 1 lookup per second, and the app waits between requests to stay within that.

## Files

```
index.html          app shell
server.py           local server that reads/writes the .txt database and saves uploaded photos
data/*.txt          the Notepad database
css/styles.css      theme and layout
js/db.js            .txt reader/writer
js/app.js           pages, navigation, forms, map picker, checkout, order tracking
js/mailer.js        emails (EmailJS + demo inbox), 6-digit code checks, forgot password
js/email-config.js  your EmailJS keys (blank = demo inbox only)
js/account.js       My account, payment methods, wallet approval, feedback
js/rider.js         rider app (#/rider) and the rider-customer chat
js/admin.js         admin pages (#/admin)
js/icons.js         outline icon set
assets/img/         photos (restaurants/ and menu/ for your own)
```
