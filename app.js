const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// Season-specific team configuration
function getTeamsForSeason(seasonId) {
  const seasonTeams = {
    1: { // Season 1
      "India": "Sonu",
      "Australia": "Radha",
      "England": "Rahitya",
      "South Africa": "Herald",
      "New Zealand": "Vishnu",
      "West Indies": "Nitin"
    },
    2: { // Season 2
      "INDIA": "SONU",
      "AUSTRALIA": "RADHA",
      "ENGLAND": "VISHNU",
      "SOUTH AFRICA": "PRAMOD",
      "NEW ZEALAND": "NITIN",
      "WEST INDIES": "SRAVAN"
    }
  };
  return seasonTeams[seasonId] || seasonTeams[1];
}

// Routes
app.get('/', async (req, res) => {
  try {
    const { rows: activeSeasons } = await db.query('SELECT * FROM seasons WHERE is_active = true LIMIT 1');
    const activeSeason = activeSeasons[0];
    const { rows: allSeasons } = await db.query('SELECT * FROM seasons ORDER BY id');
    
    const teams = getTeamsForSeason(activeSeason?.id);
    const { rows: matches } = await db.query(
      'SELECT * FROM matches WHERE season_id = $1 ORDER BY id',
      [activeSeason?.id]
    );

    // Calculate team stats
    const teamStats = {};
    Object.keys(teams).forEach(t => {
      teamStats[t] = { 
        points: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0,
        runsScored: 0, runsConceded: 0, oversFaced: 0, oversBowled: 0, nrr: 0 
      };
    });

    matches.forEach(m => {
      if (m.winner || m.is_tie) {
        if (m.is_tie) {
          teamStats[m.team1].points += 1;
          teamStats[m.team2].points += 1;
          teamStats[m.team1].matchesPlayed += 1;
          teamStats[m.team2].matchesPlayed += 1;
          teamStats[m.team1].runsScored += parseInt(m.score_team1) || 0;
          teamStats[m.team2].runsScored += parseInt(m.score_team2) || 0;
          teamStats[m.team1].runsConceded += parseInt(m.score_team2) || 0;
          teamStats[m.team2].runsConceded += parseInt(m.score_team1) || 0;
          teamStats[m.team1].oversFaced += 5;
          teamStats[m.team2].oversFaced += 5;
          teamStats[m.team1].oversBowled += 5;
          teamStats[m.team2].oversBowled += 5;
        } else {
          const winner = m.winner;
          const loser = m.team1 === winner ? m.team2 : m.team1;
          
          teamStats[winner].points += 2;
          teamStats[winner].matchesWon += 1;
          teamStats[winner].matchesPlayed += 1;
          teamStats[winner].runsScored += parseInt(m.winner === m.team1 ? m.score_team1 : m.score_team2) || 0;
          teamStats[winner].runsConceded += parseInt(m.winner === m.team1 ? m.score_team2 : m.score_team1) || 0;
          teamStats[winner].oversFaced += 5;
          teamStats[winner].oversBowled += 5;
          
          teamStats[loser].matchesLost += 1;
          teamStats[loser].matchesPlayed += 1;
          teamStats[loser].runsScored += parseInt(loser === m.team1 ? m.score_team1 : m.score_team2) || 0;
          teamStats[loser].runsConceded += parseInt(loser === m.team1 ? m.score_team2 : m.score_team1) || 0;
          teamStats[loser].oversFaced += 5;
          teamStats[loser].oversBowled += 5;
        }
      }
    });

    // Calculate NRR
    Object.keys(teamStats).forEach(t => {
      const stats = teamStats[t];
      if (stats.matchesPlayed > 0) {
        const runRateFor = stats.runsScored / stats.oversFaced;
        const runRateAgainst = stats.runsConceded / stats.oversBowled;
        stats.nrr = (runRateFor - runRateAgainst).toFixed(2);
      }
    });

    res.render('index', {
      teams,
      matches,
      teamStats,
      isAdmin: req.session.loggedIn,
      seasons: allSeasons,
      currentSeason: activeSeason
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/set-season', async (req, res) => {
  try {
    const { seasonId } = req.query;
    await db.query('UPDATE seasons SET is_active = false');
    await db.query('UPDATE seasons SET is_active = true WHERE id = $1', [seasonId]);
    res.redirect('/');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Failed to switch season');
  }
});

app.get('/admin', (req, res) => {
  res.render('login');
});

app.post('/admin', (req, res) => {
  const { username, password } = req.body;
  if (username === 'sunny@26' && password === 'sunnylovely@12345') {
    req.session.loggedIn = true;
    return res.redirect('/');
  }
  res.send('<h2>Incorrect credentials. <a href="/admin">Try again</a></h2>');
});

app.post('/add-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { rows } = await db.query('SELECT id FROM seasons WHERE is_active = true LIMIT 1');
  const { team1, team2 } = req.body;
  await db.query(
    'INSERT INTO matches (team1, team2, season_id) VALUES ($1, $2, $3)',
    [team1, team2, rows[0].id]
  );
  res.redirect('/');
});

app.post('/update-winner', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { matchId, winner, score_team1, score_team2, is_tie, notes } = req.body;
  await db.query(
    `UPDATE matches SET winner = $1, score_team1 = $2, score_team2 = $3, 
     is_tie = $4, notes = $5 WHERE id = $6`,
    [winner, score_team1, score_team2, is_tie === 'on', notes, matchId]
  );
  res.redirect('/');
});

app.post('/delete-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  await db.query('DELETE FROM matches WHERE id = $1', [req.body.id]);
  res.redirect('/');
});

app.get('/playoffs', async (req, res) => {
  const { rows: activeSeasons } = await db.query('SELECT * FROM seasons WHERE is_active = true LIMIT 1');
  const { rows: playoffMatches } = await db.query(
    'SELECT * FROM playoff_matches WHERE season_id = $1 ORDER BY id',
    [activeSeasons[0]?.id]
  );
  const { rows: teams } = await db.query('SELECT DISTINCT team1 as team FROM matches UNION SELECT DISTINCT team2 as team FROM matches');
  const { rows: seasons } = await db.query('SELECT * FROM seasons ORDER BY id');
  
  res.render('playoffs', {
    playoffMatches,
    teams: teams.map(t => t.team),
    isAdmin: req.session.loggedIn,
    seasons,
    currentSeason: activeSeasons[0]
  });
});

app.post('/add-playoff-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { rows } = await db.query('SELECT id FROM seasons WHERE is_active = true LIMIT 1');
  const { match_type, team1, team2 } = req.body;
  await db.query(
    'INSERT INTO playoff_matches (match_type, team1, team2, season_id) VALUES ($1, $2, $3, $4)',
    [match_type, team1, team2, rows[0].id]
  );
  res.redirect('/playoffs');
});

app.post('/update-playoff-result', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { matchId, winner, score_team1, score_team2, notes } = req.body;
  await db.query(
    `UPDATE playoff_matches SET winner = $1, score_team1 = $2, 
     score_team2 = $3, notes = $4 WHERE id = $5`,
    [winner, score_team1, score_team2, notes, matchId]
  );
  res.redirect('/playoffs');
});

app.post('/delete-playoff-match', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  await db.query('DELETE FROM playoff_matches WHERE id = $1', [req.body.id]);
  res.redirect('/playoffs');
});

app.post('/create-season', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { name, start_date } = req.body;
  await db.query('UPDATE seasons SET is_active = false');
  await db.query(
    'INSERT INTO seasons (name, start_date, is_active) VALUES ($1, $2, true)',
    [name, start_date]
  );
  res.redirect('/');
});

app.post('/set-season-winner', async (req, res) => {
  if (!req.session.loggedIn) return res.sendStatus(403);
  const { seasonId, winner } = req.body;
  await db.query('UPDATE seasons SET winner = $1 WHERE id = $2', [winner, seasonId]);
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});