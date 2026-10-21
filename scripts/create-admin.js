#!/usr/bin/env node
// Creates an admin account: it logs in on the app's own login and gets the
// admin interface, and may use God view.
//
//   node scripts/create-admin.js <phone> <first name> <last name> <email>
//
// It writes straight to the database the backend uses (MONGO_URL, from the
// environment or .env.backend; default the local one), so the backend need not
// run or restart. The details are checked as sign-up checks them. The password
// is random and printed once; it is never stored here, since the repository is
// public. The admin can change it with "Forgot password?" on the login, which
// emails a code to this email. An already registered phone or email is left
// unchanged.
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const backendRequire = createRequire(path.join(__dirname, '../indang-trike-backend/package.json'));
const mongoose = backendRequire('mongoose');
const bcrypt = backendRequire('bcryptjs');
const { createModels } = require('../indang-trike-backend/models');
const { normalizePhilippinePhone, profileFields } = require('../indang-trike-backend/policy');

const USAGE = 'usage: node scripts/create-admin.js <phone> <first name> <last name> <email>';

async function main() {
  const [rawPhone, firstName, lastName, email] = process.argv.slice(2);
  if (!rawPhone || !firstName || !lastName || !email) throw new Error(USAGE);
  const phone = normalizePhilippinePhone(rawPhone);
  if (!phone) throw new Error(`${rawPhone} is not a valid Philippine mobile number`);
  const fields = profileFields({ firstName, lastName, email }, 'admin');
  try { process.loadEnvFile(path.join(__dirname, '../.env.backend')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const uri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/indang_trike_db';
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const { User } = createModels(connection);
    // Also the legacy phone formats, as login matches them.
    const byPhone = await User.findOne({ phone: { $in: [phone, `0${phone.slice(3)}`, phone.slice(1), phone.slice(3)] } });
    if (byPhone) {
      console.log(`exists   ${rawPhone} is already registered (${byPhone.firstName} ${byPhone.lastName}, ${byPhone.role}); nothing changed`);
      return;
    }
    // One account per email, as at sign-up.
    const byEmail = await User.findOne({ email: fields.email });
    if (byEmail) {
      console.log(`exists   ${fields.email} already has an account (${byEmail.firstName} ${byEmail.lastName}, ${byEmail.role}); nothing changed`);
      return;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    const admin = await User.create({ phone, password: await bcrypt.hash(password, 10), role: 'admin', ...fields });
    console.log(`created  ${rawPhone} / ${password}  ${admin.firstName} ${admin.lastName} (admin) in ${connection.name}`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(`create-admin: ${error.message}`);
  process.exitCode = 1;
});
