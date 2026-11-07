// Staff accounts oversee the service and never book or drive. Both are set
// only in the database; sign-up offers passenger or driver.
// - superadmin: God view, and every TODA in the app's admin screens.
// - admin: the app's admin screens, for the drivers of one TODA (its `toda`).
// indang-trike-backend/admin.js decides what each may reach.
const STAFF_ROLES = ['admin', 'superadmin'];

const isStaff = (role) => STAFF_ROLES.includes(role);

// The roles with no email, and so no Forgot password: both staff roles, for
// now. They are seeded in the database, which is also how a lost password is
// replaced (the local admin scripts' --new-password). Taking 'admin' off this
// list gives TODA admins their email and Forgot password back.
const NO_EMAIL_ROLES = ['admin', 'superadmin'];

const usesEmail = (role) => !NO_EMAIL_ROLES.includes(role);

module.exports = { STAFF_ROLES, isStaff, NO_EMAIL_ROLES, usesEmail };
