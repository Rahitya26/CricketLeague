const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  }));

// --- Teams List ---
const teams = {
  "India": "Sonu",
  "Australia": "Radha",
  "England": "Rahitya",
  "South Africa": "Herald",
  "New Zealand": "Vishnu",
  "West Indies": "Nitin"
};

// --- Routes ---

// Home / Dashboard
app.get('/', async (req, res) => {
  const { rows: matches } = await db.query('SELECT * FROM matches ORDER BY id');
  
  // Initialize team statistics
  const teamStats = {};
  for (let t in teams) {
    teamStats[t] = {
      points: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      runsScored: 0,
      runsConceded: 0,
      oversFaced: 0,
      oversBowled: 0
    };
  }

  // Calculate statistics from matches
  matches.forEach(m => {
    if (m.winner || m.is_tie) {
      // Only count completed matches
      
      if (m.is_tie) {
        // Update both teams' stats for a tie
        teamStats[m.team1].points += 1;
        teamStats[m.team2].points += 1;
        teamStats[m.team1].matchesPlayed += 1;
        teamStats[m.team2].matchesPlayed += 1;
        teamStats[m.team1].runsScored += parseInt(m.score_team1);
        teamStats[m.team2].runsScored += parseInt(m.score_team2);
        teamStats[m.team1].runsConceded += parseInt(m.score_team2);
        teamStats[m.team2].runsConceded += parseInt(m.score_team1);
        teamStats[m.team1].oversFaced += 5;
        teamStats[m.team2].oversFaced += 5;
        teamStats[m.team1].oversBowled += 5;
        teamStats[m.team2].oversBowled += 5;
      } else {
        const winner = m.winner;
        const loser = m.team1 === winner ? m.team2 : m.team1;
        
        // Update winner stats
        teamStats[winner].points += 2;
        teamStats[winner].matchesWon += 1;
        teamStats[winner].matchesPlayed += 1;
        teamStats[winner].runsScored += parseInt(m.winner === m.team1 ? m.score_team1 : m.score_team2);
        teamStats[winner].runsConceded += parseInt(m.winner === m.team1 ? m.score_team2 : m.score_team1);
        teamStats[winner].oversFaced += 5;
        teamStats[winner].oversBowled += 5;
        
        // Update loser stats
        teamStats[loser].matchesLost += 1;
        teamStats[loser].matchesPlayed += 1;
        teamStats[loser].runsScored += parseInt(loser === m.team1 ? m.score_team1 : m.score_team2);
        teamStats[loser].runsConceded += parseInt(loser === m.team1 ? m.score_team2 : m.score_team1);
        teamStats[loser].oversFaced += 5;
        teamStats[loser].oversBowled += 5;
      }
    }
  });

  // Calculate NRR for each team
  for (let t in teamStats) {
    const stats = teamStats[t];
    if (stats.matchesPlayed > 0) {
      const runRateFor = stats.runsScored / stats.oversFaced;
      const runRateAgainst = stats.runsConceded / stats.oversBowled;
      stats.nrr = (runRateFor - runRateAgainst).toFixed(2);
    } else {
      stats.nrr = 0;
    }
  }

  res.render('index', {
    teams,
    matches,
    teamStats,
    isAdmin: req.session.loggedIn
  });
});

// Admin Login Page
app.get('/admin', (req, res) => {
  res.render('login');
});

// Handle Admin Login
app.post('/admin', (req, res) => {
  const { username, password } = req.body;
  if (username === 'sunny@26' && password === 'sunnylovely@12345') {
    req.session.loggedIn = true;
    return res.redirect('/');
  }
  res.send('<h2>Incorrect credentials. <a href="/admin">Try again</a></h2>');
});

// Add Match
app.post('/add-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { team1, team2 } = req.body;
  await db.query(
    'INSERT INTO matches (team1, team2) VALUES ($1, $2)',
    [team1, team2]
  );
  res.redirect('/');
});

// Update Winner + Scores
app.post('/update-winner', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { matchId, winner, score_team1, score_team2, is_tie, notes } = req.body;
  await db.query(
    `UPDATE matches
       SET winner = $1
         , score_team1 = $2
         , score_team2 = $3
         , is_tie = $4
         , notes = $5
     WHERE id = $6`,
    [winner, score_team1, score_team2, is_tie === 'on', notes, matchId]
  );
  res.redirect('/');
});

// Delete Match
app.post('/delete-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  await db.query('DELETE FROM matches WHERE id = $1', [req.body.id]);
  res.redirect('/');
});

// Add these new routes after your existing routes in app.js

// Get playoff matches (public)
app.get('/playoffs', async (req, res) => {
  const { rows: playoffMatches } = await db.query('SELECT * FROM playoff_matches ORDER BY id');
  const { rows: teams } = await db.query('SELECT DISTINCT team1 as team FROM matches UNION SELECT DISTINCT team2 as team FROM matches');
  
  res.render('playoffs', {
    playoffMatches,
    teams: teams.map(t => t.team),
    isAdmin: req.session.loggedIn
  });
});

// Add playoff match (admin only)
app.post('/add-playoff-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  
  const { match_type, team1, team2 } = req.body;
  await db.query(
    'INSERT INTO playoff_matches (match_type, team1, team2) VALUES ($1, $2, $3)',
    [match_type, team1, team2]
  );
  
  res.redirect('/playoffs');
});

// Update playoff match result (admin only)
app.post('/update-playoff-result', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  
  const { matchId, winner, score_team1, score_team2, notes } = req.body;
  await db.query(
    `UPDATE playoff_matches
     SET winner = $1, score_team1 = $2, score_team2 = $3, notes = $4
     WHERE id = $5`,
    [winner, score_team1, score_team2, notes, matchId]
  );
  
  res.redirect('/playoffs');
});

// Delete playoff match (admin only)
app.post('/delete-playoff-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  
  await db.query('DELETE FROM playoff_matches WHERE id = $1', [req.body.id]);
  res.redirect('/playoffs');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});