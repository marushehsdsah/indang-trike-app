# Indang Go Admin — Non-Functional Design Mockup

React Native (JavaScript, StyleSheet, no TypeScript) admin app mockup
for tricycle ride-hailing. Run on its own, nothing here talks to a real
backend — it's a clickable design prototype so you can review the flow
and screens. Inside the IndangGO app the same screens run for real (see
below).

## What's included

- **Login** — Admin ID + Password, with a show/hide eye toggle. Used only
  when this folder runs on its own; in the IndangGO app, admins log in
  on the app's own login page.
- **Welcome screen** — "Login successful" confirmation shown after login.
- **Bottom navigation** — Dashboard / Accounts / Trips.
- **Dashboard** — quick stat cards + a recent trips list.
- **Accounts** — search by name/ID, filter by Driver/Passenger, list of accounts.
- **Trips** — search by trip ID, Toda ID, passenger or driver, filter by
  Ongoing / Finished / Cancelled, list of trip records.
- **Hamburger menu** (top left) — switch between **Dashboard** (the
  Dashboard / Accounts / Trips tabs) and **Account Approval**.
- **Account Approval** — drivers who signed up wait here (Pending) until
  an admin checks their details against their TODA's list of registered
  drivers; a Suspended filter lists the drivers an admin cut off. Until
  approved, a driver can't go online or get bookings.
- **Driver Review** — opened from Account Approval or a driver in
  Accounts: the driver's sign-up details and the decisions open to them
  (Approve or Decline for a pending driver; Suspend or Delete for an
  approved one; Unblock for a suspended one). Declining removes the
  registration, so a driver who typed a detail wrong can sign up again
  with the same mobile number and email. Each asks for confirmation;
  the driver is emailed when approved, declined, suspended or deleted,
  with the optional reason typed here.
- **Profile** — opened from the avatar at the top right: the admin's name,
  Admin ID and role, and a Logout button.

Inside the IndangGO app, Dashboard, Accounts, Trips and Account Approval
load real data from the API (`GET /api/admin/dashboard`, `/accounts`,
`/trips`, `/approvals`, `/drivers/<id>`), pulling down refreshes them,
and a driver's review sends the admin's decision (`POST
/api/admin/drivers/<id>/approve`, `/decline`, `/terminate` (Suspend), `/delete`,
`/unblock`).
Run on its own, this folder shows the fake data in
`src/data/mockData.js` instead, in the same shape, and the decisions
change that fake data.

## How to run it

> **Inside the IndangGO app** these screens run from the main project:
> start it with `npm run dev` in the repository root and log in on the
> app's own login page with an admin account (a user with role
> `"admin"`, added only in the database); the app then opens Welcome,
> skipping this folder's Login. Don't run `npm install`
> in this folder there — a second `node_modules` here would load a
> second copy of React into the app and break it ("Invalid hook
> call"). The steps below are for running this folder on its own.

This project targets **Expo SDK 54** (React Native 0.81, React 19.1).
SDK 54 requires **Node.js 20.19.4 or newer** — check with `node -v`
and upgrade first if you're on an older version.

1. Install [Node.js](https://nodejs.org) if you don't have it (or upgrade it).
2. Open a terminal in this folder and run:
   ```
   npm install
   npx expo start
   ```
   If any dependency versions look mismatched (e.g. after you add
   new packages later), run `npx expo install --fix` — it re-aligns
   every package to the version your installed Expo SDK expects.
3. Scan the QR code with the **Expo Go** app on your phone
   (search "Expo Go" on the App Store / Play Store), or press
   `w` in the terminal to preview in a web browser, or `a`/`i`
   for an Android/iOS simulator if you have one set up.

No native build tools are required — Expo handles that for you.

## Navigation

The app-level navigator is a **Stack Navigator**
(`@react-navigation/native-stack`), set up in `App.js`:

```
Login  ->  Welcome  ->  Main
                          ├─>  Profile
                          └─>  AccountApproval  ->  DriverReview
```

Each screen moves forward with `navigation.replace(...)` (not
`navigate`), so the previous screen is removed from the stack —
you can't swipe or press back into Login once you're on Welcome,
or back into Welcome once you're on Main.

Profile is the exception: the avatar in `TopHeader` opens it with
`navigation.navigate('Profile')`, so back returns to the tab you
were on. Its Logout button resets the stack to Login alone, so
back can't return to the dashboard after logging out.

Account Approval is opened from the hamburger menu in `TopHeader`
the same way, and Driver Review from a driver in Account Approval
or Accounts, so back returns to where you were. Dashboard in the
menu goes back to `Main` with `navigation.popTo('Main', { tab:
'dashboard', at })`, which `MainScreen` turns into its Dashboard
tab.

Inside the IndangGO app the same stack, without Login, is set up
again in `../navigation/AdminNavigator.js` — add any new admin screen
there as well as in `App.js`. There the screens show the signed-in
admin account (`src/session.js`), and Logout ends the app's session.

The bottom tab bar (Dashboard / Accounts / Trips) is **not** part
of the stack — it lives inside `Main` (`src/screens/MainScreen.js`)
as simple local state, since those three tabs don't need their own
back-history. If you later want each tab to keep its own navigation
stack, swap `BottomNav` there for
`@react-navigation/bottom-tabs`' `createBottomTabNavigator` and
nest it as the `Main` screen instead.

## Project structure

```
App.js                     <- root: Stack Navigator (Login -> Welcome -> Main, + Profile)
src/
  screens/
    LoginScreen.js
    WelcomeScreen.js
    MainScreen.js            <- owns the bottom tab bar + tab switching
    DashboardScreen.js
    AccountsScreen.js
    TripsScreen.js
    ProfileScreen.js         <- admin profile + Logout (opened from the avatar)
    AccountApprovalScreen.js <- drivers waiting for approval, and suspended ones
    DriverReviewScreen.js    <- one driver's details + Approve/Decline/Suspend/Delete/Unblock
  components/
    TopHeader.js            <- shared top bar (hamburger menu + title + avatar -> Profile)
    BottomNav.js             <- shared bottom tab bar
    StatusBadge.js            <- colored status/role pill used everywhere
    LoadState.js              <- spinner / error + Retry while a screen's data loads
  theme/
    colors.js                 <- ALL colors live here — edit this to re-skin
  data/
    mockData.js                <- fake accounts + trips data (when run on its own)
  session.js                   <- signed-in admin, Logout, where data comes from and decisions go
  useAdminData.js              <- loads a screen's data (API or mock), again on coming back
  formatDate.js                <- dates in Philippine time
```

## Where to make common edits

| I want to...                                   | Edit this file                          |
|--------------------------------------------------|------------------------------------------|
| Change any color / the whole palette              | `src/theme/colors.js`                     |
| Change the real accounts/trips the screens get   | `../indang-trike-backend/admin.js` (`buildAccounts`, `buildTrips`) |
| Change the hamburger menu's items                  | `src/components/TopHeader.js` (`MENU_ITEMS`) |
| Change what a driver decision asks or says         | `src/screens/DriverReviewScreen.js` (`DECISIONS`, `ACTIONS`) |
| Change what a decision does on the server          | `../indang-trike-backend/admin.js` (`approve`, `decline`, `terminate`, `remove`, `unblock`) |
| Add, remove, or change mock accounts              | `src/data/mockData.js` (`accounts` array) |
| Add, remove, or change mock trips                 | `src/data/mockData.js` (`trips` array)    |
| Add a new status (e.g. "On Hold")                 | `src/components/StatusBadge.js` (`STATUS_COLORS`) |
| Add/remove a bottom nav tab                       | `src/components/BottomNav.js` (`TABS` array) |
| Change what happens when Login is tapped          | `src/screens/LoginScreen.js` (`handleLogin`) |
| Change how long the welcome screen stays up       | `src/screens/WelcomeScreen.js` (`AUTO_ADVANCE_MS`) |
| Add a new top-level screen (stack route)          | `App.js` and `../navigation/AdminNavigator.js` (`Stack.Screen`) |
| Change the admin's name / ID / role                | `src/data/mockData.js` (`currentAdmin`) |
| Change what happens when Logout is tapped         | `src/screens/ProfileScreen.js` (`handleLogout`) |
| Add real account-search filters                    | `src/screens/AccountsScreen.js` (`ROLE_FILTERS`, `filteredAccounts`) |
| Add real trip-status filters                        | `src/screens/TripsScreen.js` (`STATUS_FILTERS`, `filteredTrips`) |

## Notes on what's NOT wired up (by design, since this is a mockup)

- Login doesn't check the Admin ID/password — any tap on "Login" succeeds.
- Logout doesn't end a real session — it just returns to Login.
- "Forgot?" doesn't do anything yet (`onPress={() => {}}`).
  Search for `TODO` comments in the code — those mark exactly where to
  plug in real behavior later.
- Tapping a passenger or trip row doesn't open a details screen yet
  (a driver opens Driver Review).
- Bottom navigation is a simple custom component (not
  `@react-navigation`), so there's very little setup. If you later
  want real screen transitions/animations or deep linking, swap it
  for `@react-navigation/bottom-tabs` — the visual design can be
  reused almost as-is inside a custom `tabBar` render function.
