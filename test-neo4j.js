require('dotenv').config({ path: '.env.local' });
const neo4j = require('neo4j-driver');

console.log('Loaded env vars:');
console.log('NEO4J_URI =', process.env.NEO4J_URI);
console.log('NEO4J_USER =', process.env.NEO4J_USER);
console.log('NEO4J_PASS =', process.env.NEO4J_PASS);

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASS)
);

async function test() {
  try {
    const session = driver.session();
    const result = await session.run('RETURN 1 AS test');
    console.log('Neo4j connection successful:', result.records[0].get('test'));
    await session.close();
    await driver.close();
  } catch (err) {
    console.error('Neo4j connection failed:', err);
  }
}

test();