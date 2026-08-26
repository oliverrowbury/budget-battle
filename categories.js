// Category / sub-category structure mapping to real gamePools keys.
// Mirrors the Explore section on index.html. This is the single source of
// truth create.js uses to build the game-selection dropdowns.

const bidoffCategories = {
  "Sports": {
    icon: "🏆",
    subcategories: {
      "🏀 Basketball": [
        "NBA — All-Time", "NBA — Current", "NBA — All-Time Superstars", "NBA — Current Superstars",
        "NBA — American Players", "NBA — European Players", "NBA — Non-American Players",
        "NBA — Current U23", "EuroLeague — All-Time",
        "NBA — Atlanta Hawks", "NBA — Boston Celtics", "NBA — Brooklyn Nets", "NBA — Charlotte Hornets",
        "NBA — Chicago Bulls", "NBA — Cleveland Cavaliers", "NBA — Dallas Mavericks", "NBA — Denver Nuggets",
        "NBA — Detroit Pistons", "NBA — Golden State Warriors", "NBA — Houston Rockets", "NBA — Indiana Pacers",
        "NBA — LA Clippers", "NBA — Los Angeles Lakers", "NBA — Memphis Grizzlies", "NBA — Miami Heat",
        "NBA — Milwaukee Bucks", "NBA — Minnesota Timberwolves", "NBA — New Orleans Pelicans",
        "NBA — New York Knicks", "NBA — Oklahoma City Thunder", "NBA — Orlando Magic",
        "NBA — Philadelphia 76ers", "NBA — Phoenix Suns", "NBA — Portland Trail Blazers",
        "NBA — Sacramento Kings", "NBA — San Antonio Spurs", "NBA — Toronto Raptors",
        "NBA — Utah Jazz", "NBA — Washington Wizards",
      ],
      "⚽ Football": [
        "Premier League — Current", "Premier League — All-Time",
        "La Liga — Current", "La Liga — All-Time",
        "Bundesliga — All-Time", "Serie A — All-Time", "Ligue 1 — All-Time",
        "Football — All-Time", "Football — Current",
        "England — All-Time", "Spain — All-Time", "France — All-Time", "Germany — All-Time",
        "Italy — All-Time", "Brazil — All-Time", "Argentina — All-Time",
        "Football — Arsenal", "Football — Manchester City", "Football — Liverpool", "Football — Chelsea",
        "Football — Tottenham Hotspur", "Football — Real Madrid", "Football — Barcelona",
        "Football — Atlético Madrid", "Football — Bayern Munich", "Football — Borussia Dortmund",
        "Football — Paris Saint-Germain", "Football — Juventus", "Football — AC Milan", "Football — Inter Milan",
        "Top Clubs — All-Time, One Club",
      ],
      "🏎️ Motorsport": [
        "F1 — Current", "F1 — All-Time", "F1 — One Team", "MotoGP — Current", "MotoGP — All-Time",
      ],
      "🎾 Tennis": [
        "Tennis — Current", "Tennis — All-Time", "Tennis — Men's All-Time", "Tennis — Women's All-Time",
      ],
      "🏌️ Golf": ["Golf — Current", "Golf — All-Time"],
      "🏃 Athletics": ["Athletics — Current", "Athletics — All-Time"],
      "🏈 American Football": ["NFL — Current", "NFL — All-Time", "NFL — One Team"],
      "⚾ Baseball": ["MLB — Current", "MLB — All-Time", "MLB — One Team"],
      "🏉 Rugby": ["Rugby — Current", "Rugby — All-Time", "Rugby — One Club"],
      "🏏 Cricket": ["Cricket — Current", "Cricket — All-Time", "IPL — Current", "IPL — All-Time", "Cricket — One Team"],
    },
  },

  "Film & TV": {
    icon: "🎬",
    games: [
      "Star Wars — Build a Squad", "Marvel — Build a Squad", "DC — Build a Squad",
      "Harry Potter — Build a Squad", "Lord of the Rings — Build a Squad", "Jurassic Park — Build a Squad",
      "Best Cast — All-Time", "Movies — All-Time", "Build a Movie", "Shows — All-Time",
    ],
  },

  "Music": {
    icon: "🎵",
    games: [
      "Artists — All", "Rappers", "US Rap Songs", "UK Rap", "House Artists", "Dad Music",
      "Top Songs — All-Time", "Drake Songs", "Older Artists", "Older Songs",
    ],
  },

  "Random": {
    icon: "🎲",
    games: [
      "🌴 Perfect Life", "Video Games", "Mobile Games", "All-Time Games", "🐾 Animals",
      "Build a 5-Course Meal", "Countries", "Build a Country", "Funniest Squad",
      "Survival Apocalypse", "Weirdest Team", "Build a Garage", "YouTubers",
    ],
  },
};
