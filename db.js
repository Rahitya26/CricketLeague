const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ECL Cricket',
  password: 'sunnylovely@12345',
  port: 5432
});

module.exports = {
  query: (text, params) => pool.query(text, params)
};
