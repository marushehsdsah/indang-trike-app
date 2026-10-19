#!/usr/bin/env node
// Creates the TODA tester: one driver account that may switch to any Indang
// TODA from its profile, to check each TODA's zone and the trips it is
// offered. Every other driver keeps the TODA it signed up with.
//
//   node scripts/create-toda-tester.js
//
// It writes straight to the database the backend uses (MONGO_URL, from the
// environment or .env.backend; default the local one), so it also works while
// the backend is stopped. If the phone is already registered, that account
// becomes the tester and keeps its password. Any other account marked as
// tester loses the mark, so only one exists.
const path = require('node:path');
const { createRequire } = require('node:module');

const backendRequire = createRequire(path.join(__dirname, '../indang-trike-backend/package.json'));
const mongoose = backendRequire('mongoose');
const bcrypt = backendRequire('bcryptjs');
const { createModels } = require('../indang-trike-backend/models');
const { normalizePhilippinePhone, profileFields } = require('../indang-trike-backend/policy');

const PHONE = '09990000300';
const PASSWORD = 'toda-tester-2026';
const PROFILE = {
  firstName: 'Toda', lastName: 'Tester', email: 'toda.tester@example.com',
  plate: 'TODA-TEST', toda: 'BITODA', capacity: 4,
};

async function main() {
  try { process.loadEnvFile(path.join(__dirname, '../.env.backend')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const uri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/indang_trike_db';
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const { User } = createModels(connection);
    const phone = normalizePhilippinePhone(PHONE);
    const existing = await User.findOne({ phone: { $in: [phone, PHONE] } });
    let tester;
    if (existing) {
      tester = await User.findByIdAndUpdate(existing._id, { $set: { todaTester: true } }, { returnDocument: 'after' });
      console.log(`exists   ${PHONE} is now the TODA tester (password unchanged)`);
    } else {
      tester = await User.create({ phone, password: await bcrypt.hash(PASSWORD, 10), role: 'driver',
        ...profileFields(PROFILE, 'driver'), todaTester: true });
      console.log(`created  ${PHONE} / ${PASSWORD}  ${tester.firstName} ${tester.lastName} · ${tester.toda}`);
    }
    const { modifiedCount } = await User.updateMany({ _id: { $ne: tester._id }, todaTester: true }, { $set: { todaTester: false } });
    if (modifiedCount) console.log(`cleared  the tester mark from ${modifiedCount} other account(s)`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(`create-toda-tester: ${error.message} (is MongoDB running?)`);
  process.exitCode = 1;
});
