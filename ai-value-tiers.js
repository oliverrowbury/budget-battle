// Sparse "how good is this pick" signal for the AI opponent, so it bids
// like it actually knows the domain instead of treating every item as
// interchangeable. Only pools listed here get tier-aware bidding — every
// other pool falls back to the plain budget/slots heuristic in play.js.
//
// Deliberately sparse: only players I'm confident rating are listed.
// Anything in a covered pool but not listed here defaults to tier 3
// (average) rather than guessing — that's especially true for deep
// current-season benches/rookies and anything transfer-window-dependent,
// where a wrong guess is worse than no signal at all.
//
// tier1 = superstar, fight hard for it. tier2 = clearly good, worth a
// real premium. tier3 (default, unlisted) = average. tier4 = weak/deep
// bench, not worth overpaying for.

const aiValueTiers = {
  "NBA — All-Time": {
    tier1: [
      "Michael Jordan", "LeBron James", "Kareem Abdul-Jabbar", "Magic Johnson", "Larry Bird",
      "Wilt Chamberlain", "Bill Russell", "Kobe Bryant", "Tim Duncan", "Shaquille O'Neal",
      "Hakeem Olajuwon", "Kevin Durant", "Stephen Curry", "Giannis Antetokounmpo", "Nikola Jokić",
      "Oscar Robertson", "Jerry West", "Karl Malone", "Charles Barkley", "Moses Malone",
      "Julius Erving", "David Robinson", "Isiah Thomas", "John Stockton", "Scottie Pippen",
    ],
    tier2: [
      "Dirk Nowitzki", "Kevin Garnett", "Allen Iverson", "Dwyane Wade", "Chris Paul",
      "James Harden", "Russell Westbrook", "Steve Nash", "Ray Allen", "Reggie Miller",
      "Vince Carter", "Tracy McGrady", "Clyde Drexler", "Patrick Ewing", "George Mikan",
      "Dominique Wilkins", "Elgin Baylor", "John Havlicek", "Dennis Rodman", "Gary Payton",
      "Manu Ginóbili", "Tony Parker", "Paul Pierce", "Kevin McHale", "Bob Cousy",
      "Walt Frazier", "Pete Maravich", "Anthony Davis", "Kawhi Leonard", "Damian Lillard",
      "Luka Dončić", "Shai Gilgeous-Alexander", "Jayson Tatum", "Kyrie Irving", "Chris Webber",
      "Grant Hill", "Carmelo Anthony", "Pau Gasol", "Dwight Howard", "Yao Ming",
      "Rick Barry", "Bob Pettit", "Willis Reed", "Jason Kidd", "Alonzo Mourning",
      "Dikembe Mutombo", "Karl-Anthony Towns", "Rudy Gobert", "Joel Embiid", "Kevin Love",
      "DeMarcus Cousins", "Klay Thompson", "Draymond Green", "Paul George", "Jimmy Butler",
      "Victor Wembanyama",
    ],
    tier4: [
      "Boban Marjanović", "JaVale McGee", "Spud Webb", "Brian Scalabrine", "Matt Bonner",
      "Zaza Pachulia", "Frederic Weis", "World B. Free", "Micheal Ray Richardson", "Bo Outlaw",
      "Rony Seikaly", "Bruno Caboclo", "Darko Miličić", "Frank Kaminsky", "Kwame Brown",
      "Eddy Curry", "Adam Morrison", "Anthony Bennett", "Hasheem Thabeet", "Sam Bowie",
      "Royce White", "Michael Olowokandi", "Jay Williams", "Shawn Bradley", "Roy Tarpley",
      "Caleb Swanigan", "Thon Maker", "Mario Hezonja", "Nick Collison", "Anderson Varejão",
      "Udonis Haslem", "Matt Barnes", "P.J. Tucker", "Anthony Mason", "Nate Robinson",
      "Muggsy Bogues",
    ],
  },
  "NBA — Current": {
    tier1: [
      "Nikola Jokic", "Luka Doncic", "Shai Gilgeous-Alexander", "Giannis Antetokounmpo",
      "Victor Wembanyama", "Jayson Tatum", "Anthony Edwards", "Stephen Curry", "Kevin Durant",
      "LeBron James", "Joel Embiid", "Damian Lillard", "Devin Booker", "Donovan Mitchell",
      "Tyrese Haliburton", "Kawhi Leonard", "Paul George", "Kyrie Irving", "Jalen Brunson",
      "Cade Cunningham",
    ],
    tier2: [
      "Ja Morant", "Trae Young", "Domantas Sabonis", "Karl-Anthony Towns", "Bam Adebayo",
      "Jaylen Brown", "Jalen Williams", "Franz Wagner", "Paolo Banchero", "Chet Holmgren",
      "Alperen Sengun", "Evan Mobley", "Scottie Barnes", "James Harden", "Kristaps Porzingis",
      "De'Aaron Fox", "Zion Williamson", "Brandon Ingram", "LaMelo Ball", "Klay Thompson",
      "Rudy Gobert", "Jarrett Allen", "Coby White", "Cooper Flagg", "Dyson Daniels",
      "Amen Thompson", "Ausar Thompson", "Anthony Davis", "Julius Randle", "Jamal Murray",
      "Michael Porter, Jr.", "Norman Powell", "Fred VanVleet", "Mikal Bridges", "OG Anunoby",
      "Josh Hart", "Deni Avdija", "Desmond Bane", "Jaren Jackson, Jr.", "Pascal Siakam",
    ],
  },
};

function aiItemTier(gameKey, itemName) {
  const pool = aiValueTiers[gameKey];
  if (!pool) return 3;
  if (pool.tier1 && pool.tier1.includes(itemName)) return 1;
  if (pool.tier2 && pool.tier2.includes(itemName)) return 2;
  if (pool.tier4 && pool.tier4.includes(itemName)) return 4;
  return 3;
}
