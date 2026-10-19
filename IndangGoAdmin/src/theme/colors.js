// =============================================================
// theme/colors.js
// -------------------------------------------------------------
// EDIT ME FIRST if you want to re-skin the whole app.
// Every screen imports colors from here instead of hard-coding
// hex values, so changing a value here updates the whole app.
// =============================================================

const colors = {
  // ---- Brand ----------------------------------------------------
  brandYellow: '#FFC229',       // header gradient / primary brand color
  brandYellowSoft: '#FFE39A',   // lighter gradient end
  brandGreenDark: '#123D22',    // Login button, dark headings, active icons
  brandGreen: '#1E6B3C',        // secondary green (splash checkmark bg)

  // ---- Status colors (badges / pills) ----------------------------
  statusOngoing: '#2FA84F',     // green  - trip ongoing / account active
  statusCompleted: '#9AA0A6',   // gray   - trip completed
  statusCancelled: '#E5484D',   // red    - trip cancelled / account blocked
  statusPending: '#F5A623',     // orange - pending docs / idle
  statusVerified: '#2FA84F',    // green  - verified account
  statusBlocked: '#E5484D',     // red    - blocked account
  statusSuspended: '#E5484D',   // red    - suspended account
  statusInactive: '#9AA0A6',    // gray   - inactive account
  roleRider: '#F5A623',         // yellow-orange "RIDER" badge
  rolePassenger: '#2FA84F',     // green  "PASSENGER" badge

  // ---- Neutrals ---------------------------------------------------
  background: '#F6F7F5',        // app background
  card: '#FFFFFF',              // card / surface background
  border: '#E9ECEF',            // hairline borders / dividers
  textPrimary: '#1B1F23',       // main text
  textSecondary: '#6B7280',     // secondary / muted text
  textOnDark: '#FFFFFF',        // text placed on dark/green surfaces
  placeholder: '#9CA3AF',       // input placeholder text

  // ---- Bottom nav ---------------------------------------------------
  navActiveBg: '#FFC229',       // active tab pill background
  navActiveText: '#123D22',     // active tab icon/label color
  navInactive: '#9CA3AF',       // inactive tab icon/label
  navBackground: '#FFFFFF',
};

export default colors;
