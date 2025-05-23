require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false
  } : false
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create tables with proper constraints
    await client.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        start_date DATE,
        end_date DATE,
        winner VARCHAR(100),
        is_active BOOLEAN DEFAULT false
      )`);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        team1 VARCHAR(100) NOT NULL,
        team2 VARCHAR(100) NOT NULL,
        score_team1 INTEGER,
        score_team2 INTEGER,
        winner VARCHAR(100),
        is_tie BOOLEAN DEFAULT false,
        notes TEXT,
        season_id INTEGER REFERENCES seasons(id)
      )`);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS playoff_matches (
        id SERIAL PRIMARY KEY,
        match_type VARCHAR(50) NOT NULL,
        team1 VARCHAR(100) NOT NULL,
        team2 VARCHAR(100) NOT NULL,
        score_team1 INTEGER,
        score_team2 INTEGER,
        winner VARCHAR(100),
        notes TEXT,
        season_id INTEGER REFERENCES seasons(id)
      )`);

    // Check if Season 1 exists
    const { rows: existingSeasons } = await client.query(
      'SELECT id FROM seasons WHERE name = $1', 
      ['Season 1']
    );
    
    if (existingSeasons.length === 0) {
      // Insert Season 1 if it doesn't exist
      await client.query(`
        INSERT INTO seasons (name, winner, is_active) 
        VALUES ('Season 1', 'Radha (Australia)', true)
      `);
      console.log('Created Season 1');
    }

    // Check if Season 2 exists
    const { rows: existingSeason2 } = await client.query(
      'SELECT id FROM seasons WHERE name = $1', 
      ['Season 2']
    );
    
    if (existingSeason2.length === 0) {
      // Insert Season 2 if it doesn't exist
      await client.query(`
        INSERT INTO seasons (name, is_active) 
        VALUES ('Season 2', false)
      `);
      console.log('Created Season 2');
    }

    // Migrate existing matches to Season 1
    const { rows: season1 } = await client.query(
      'SELECT id FROM seasons WHERE name = $1 LIMIT 1',
      ['Season 1']
    );
    
    if (season1.length > 0) {
      const { rowCount } = await client.query(`
        UPDATE matches SET season_id = $1 WHERE season_id IS NULL
      `, [season1[0].id]);
      console.log(`Migrated ${rowCount} matches to Season 1`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run initialization
initializeDatabase()
  .then(() => console.log('Database initialized successfully'))
  .catch(err => console.error('Database initialization failed:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  shutdown: async () => {
    await pool.end();
    console.log('Database pool ended');
  }
};