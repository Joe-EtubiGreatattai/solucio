process.env.JWT_SECRET = 'test-secret';
process.env.HOSPITAL_NAME = 'Test Hospital';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// TEST_MONGODB_URI uses a local MongoDB instead of downloading one. It must be a throwaway
// database: every collection is emptied after each test.
const local = process.env.TEST_MONGODB_URI;
if (local && !/test/i.test(local.split('/').pop())) throw new Error('TEST_MONGODB_URI must point to a database whose name contains "test"');

let mongod;
beforeAll(async () => {
  if (local) {
    await mongoose.connect(local);
  } else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
});
afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const key of Object.keys(cols)) await cols[key].deleteMany({});
});
afterAll(async () => {
  if (local) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod?.stop();
});
