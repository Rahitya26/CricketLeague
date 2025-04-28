// db.js
require('dotenv').config();
const { Pool } = require('pg');

// Create the pool using DATABASE_URL from your .env file
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // required for some hosts like Supabase
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params)
};


