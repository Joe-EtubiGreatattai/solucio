process.env.JWT_SECRET = 'test-secret';
process.env.HOSPITAL_NAME = 'Test Hospital';
process.env.MONGODB_MEMORY_SERVER_SKIP_DOWNLOAD = 'true';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { family: 4 });
});
afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const key of Object.keys(cols)) await cols[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
