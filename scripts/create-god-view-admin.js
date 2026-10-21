#!/usr/bin/env node
// Creates an app account for signing in to God view (web/god-view):
//
//   node scripts/create-god-view-admin.js <phone> <first name> <last name>
//
// It writes straight to the database the backend uses (MONGO_URL, from the
// environment or .env.backend; default the local one). The password is
// random and printed once; it is never stored here, since the repository is
// public. The account only gets God view access once its phone is listed in
// GOD_VIEW_ADMIN_PHONES on the API (Render and .env.backend), and the API
// has been restarted. An already registered phone is left unchanged.
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const backendRequire = createRequire(path.join(__dirname, '../indang-trike-backend/package.json'));
const mongoose = backendRequire('mongoose');
const bcrypt = backendRequire('bcryptjs');
const { createModels } = require('../indang-trike-backend/models');
const { normalizePhilippinePhone, profileFields } = require('../indang-trike-backend/policy');

async function main() {
  const [rawPhone, firstName, lastName] = process.argv.slice(2);
  const phone = normalizePhilippinePhone(rawPhone || '');
  if (!phone || !firstName || !lastName) throw new Error('usage: node scripts/create-god-view-admin.js <phone> <first name> <last name>');
  try { process.loadEnvFile(path.join(__dirname, '../.env.backend')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const uri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/indang_trike_db';
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const { User } = createModels(connection);
    const existing = await User.findOne({ phone: { $in: [phone, rawPhone] } });
    if (existing) {
      console.log(`exists   ${rawPhone} is already registered (${existing.firstName} ${existing.lastName}, ${existing.role}); nothing changed`);
      return;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    const email = `godview.${phone.replace(/\D/g, '')}@example.com`;
    const admin = await User.create({ phone, password: await bcrypt.hash(password, 10), role: 'passenger',
      ...profileFields({ firstName, lastName, email }, 'passenger') });
    console.log(`created  ${rawPhone} / ${password}  ${admin.firstName} ${admin.lastName} in ${connection.name}`);
    console.log(`next     add ${rawPhone} to GOD_VIEW_ADMIN_PHONES and restart the API`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(`create-god-view-admin: ${error.message}`);
  process.exitCode = 1;
});
