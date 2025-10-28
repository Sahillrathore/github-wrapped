const express = require("express");
const { Octokit } = require("@octokit/rest");
const router = express.Router();
const UserStats = require('../models/stats');

require("dotenv").config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error("Missing GITHUB_TOKEN in .env");
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function getCommitRank(totalCommits) {
  if (totalCommits >= 5000) return "Top 0.5%-1%";
  if (totalCommits >= 2000) return "Top 1%-3%";
  if (totalCommits >= 1000) return "Top 5%-10%";
  if (totalCommits >= 500) return "Top 10%-15%";
  if (totalCommits >= 200) return "Top 25%-30%";
  if (totalCommits >= 50) return "Median 50%";
  return "Bottom 30%";
}

router.get("/", async (req, res) => {
  const username = req.query.username;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                  weekday
                }
              }
            }
          }
          repositories(first: 100, orderBy: {field: STARGAZERS, direction: DESC}) {
            nodes {
              stargazerCount
              primaryLanguage {
                name
              }
            }
          }
        }
      }
    `;

    const result = await octokit.graphql(query, { username });
    const user = result.user;

    const contributionDays = user.contributionsCollection.contributionCalendar.weeks
      .flatMap(week => week.contributionDays)
      .filter(day => new Date(day.date) >= new Date("2024-01-01"));

    const monthlyCommits = {};
    const dailyCommits = {};

    contributionDays.forEach(day => {
      const month = new Date(day.date).getMonth();
      monthlyCommits[month] = (monthlyCommits[month] || 0) + day.contributionCount;
      dailyCommits[day.weekday] = (dailyCommits[day.weekday] || 0) + day.contributionCount;
    });

    const mostActiveMonthKey = Object.entries(monthlyCommits).sort((a, b) => b[1] - a[1])[0][0];
    const mostActiveDayKey = Object.entries(dailyCommits).sort((a, b) => b[1] - a[1])[0][0];

    const languages = {};
    user.repositories.nodes.forEach(repo => {
      const lang = repo.primaryLanguage?.name;
      if (lang) {
        languages[lang] = (languages[lang] || 0) + 1;
      }
    });

    const topLanguages = Object.entries(languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([lang]) => lang);

    let currentStreak = 0;
    let maxStreak = 0;
    for (const day of contributionDays) {
      if (day.contributionCount > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    const stats = {
      longestStreak: maxStreak,
      totalCommits: user.contributionsCollection.contributionCalendar.totalContributions,
      commitRank: getCommitRank(user.contributionsCollection.contributionCalendar.totalContributions),
      calendarData: contributionDays,
      mostActiveDay: {
        name: WEEKDAY_NAMES[parseInt(mostActiveDayKey)],
        commits: dailyCommits[mostActiveDayKey],
      },
      mostActiveMonth: {
        name: MONTH_NAMES[parseInt(mostActiveMonthKey)],
        commits: monthlyCommits[mostActiveMonthKey],
      },
      starsEarned: user.repositories.nodes.reduce(
        (sum, repo) => sum + repo.stargazerCount,
        0
      ),
      topLanguages,
    };

    res.json(stats);
  } catch (error) {
    console.error("GitHub API error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/save", async (req, res) => {
  const { username, user, stats, characterInfo } = req.body;
  if (!username || !user || !stats || !characterInfo) return res.status(400).json({ error: 'Missing data' });

  try {
    const result = await UserStats.findOneAndUpdate(
      { username },
      { user, stats, updatedAt: new Date(), characterInfo, },
      { upsert: true, new: true },
    );

    res.json({ message: 'User stats saved or updated', data: result });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
})

// GET top 10 users by commit count
router.get('/leaderboard', async (req, res) => {
    try {
        const topUsers = await UserStats.find({})
            .sort({ 'stats.totalCommits': -1 }) 
            .limit(10);

        const simplified = topUsers.map(user => ({
            username: user.username,
            profile: user.user?.avatar_url || '',
            character: user?.characterInfo?.name || 'Unknown',
            score: user.stats.score || 0,
            commits: user.stats.totalCommits || 0,
            streak: user.stats.longestStreak || 0,
        }));

        res.json(simplified);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});


module.exports = router;
