import pkg from 'pg';
const { Client } = pkg;

async function testConnection() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password: 'root',
    // try without password first
  });

  try {
    console.log('🔌 Attempting to connect to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // List existing databases
    const result = await client.query('SELECT datname FROM pg_database');
    console.log('📋 Existing databases:');
    result.rows.forEach(row => console.log(`  - ${row.datname}`));
    
    // Try to create marketplace database
    try {
      await client.query('CREATE DATABASE marketplace');
      console.log('✅ Created "marketplace" database!');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Database "marketplace" already exists');
      } else {
        console.log('❌ Error creating database:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('💡 Try different credentials in the code...');
  } finally {
    await client.end();
  }
}

testConnection();