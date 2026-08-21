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
      "Alperen Sengun", "Evan Mobley", "Scottie Barnes", "Kristaps Porzingis",
      "De'Aaron Fox", "Zion Williamson", "Brandon Ingram", "LaMelo Ball", "Klay Thompson",
      "Rudy Gobert", "Jarrett Allen", "Coby White", "Cooper Flagg", "Dyson Daniels",
      "Amen Thompson", "Ausar Thompson", "Anthony Davis", "Julius Randle", "Jamal Murray",
      "Michael Porter, Jr.", "Norman Powell", "Fred VanVleet", "Mikal Bridges", "OG Anunoby",
      "Josh Hart", "Deni Avdija", "Desmond Bane", "Jaren Jackson, Jr.", "Pascal Siakam",
    ],
  },
  "Marvel — Build a Squad": {
    tier1: [
      "Iron Man", "Captain America", "Thor", "Hulk", "Spider-Man", "Black Panther",
      "Doctor Strange", "Scarlet Witch", "Wolverine", "Deadpool", "Thanos", "Loki",
      "Black Widow", "Captain Marvel",
    ],
    tier4: [
      "Ant-Man", "Wasp", "Ms. Marvel", "War Machine", "America Chavez", "Mantis",
      "Baron Zemo", "Vulture", "Mysterio", "Yelena Belova",
    ],
  },
  "Star Wars — Build a Squad": {
    tier1: [
      "Luke Skywalker", "Darth Vader", "Han Solo", "Princess Leia", "Obi-Wan Kenobi",
      "Yoda", "Emperor Palpatine", "Anakin Skywalker", "Rey", "Kylo Ren", "Chewbacca",
      "Boba Fett", "Darth Maul", "Mace Windu",
    ],
    tier4: [
      "BB-8", "Snoke", "Jango Fett", "Qi'ra", "Reva", "Maz Kanata", "Saw Gerrera",
      "K-2SO", "Captain Phasma",
    ],
  },
  "DC — Build a Squad": {
    tier1: [
      "Superman", "Batman", "Wonder Woman", "The Flash", "Joker", "Harley Quinn",
      "Aquaman", "Green Lantern", "Darkseid", "Lex Luthor",
    ],
    tier4: [
      "Static", "Booster Gold", "Doctor Fate", "Plastic Man", "Vixen", "Toyman",
      "Metallo", "Parasite", "Brother Blood", "Nite Owl", "Etrigan", "Ocean Master", "Terra",
    ],
  },
  "Harry Potter — Build a Squad": {
    tier1: [
      "Harry Potter", "Hermione Granger", "Ron Weasley", "Albus Dumbledore", "Severus Snape",
      "Voldemort", "Sirius Black", "Rubeus Hagrid", "Draco Malfoy", "Bellatrix Lestrange",
      "Minerva McGonagall",
    ],
    tier4: [
      "Stan Shunpike", "Mad-Eye Moody's Portrait", "Marietta Edgecombe", "Zacharias Smith",
      "Justin Finch-Fletchley", "Colin Creevey", "Dennis Creevey", "Michael Corner",
      "Anthony Goldstein", "Terry Boot", "Roger Davies", "Amos Diggory", "Grawp",
    ],
  },
  "Lord of the Rings — Build a Squad": {
    tier1: [
      "Frodo Baggins", "Gandalf", "Aragorn", "Legolas", "Gimli", "Sauron", "Gollum",
      "Samwise Gamgee", "Saruman", "Bilbo Baggins",
    ],
    tier4: [
      "Bard II", "Girion", "Alfrid", "Bert the Troll", "Tom the Troll", "William the Troll",
      "Ted Sandyman", "Farmer Maggot", "Otho Sackville-Baggins", "Fatty Bolger",
      "Beregond's Son Bergil", "Húrin of the Keys",
    ],
  },
  "Rappers": {
    tier1: [
      "Jay-Z", "Eminem", "Kendrick Lamar", "Drake", "Nas", "Tupac Shakur",
      "The Notorious B.I.G.", "Kanye West", "Lil Wayne", "J. Cole", "Andre 3000",
    ],
    tier4: [
      "House of Pain", "Onyx", "Goodie Mob", "Isaiah Rashad", "Ab-Soul", "JID",
      "Denzel Curry", "Freddie Gibbs", "Nas Escobar",
    ],
  },
  "Top Songs — All-Time": {
    tier1: [
      "Bohemian Rhapsody", "Imagine", "Like a Rolling Stone", "Hey Jude", "Billie Jean",
      "Hotel California", "Stairway to Heaven", "Thriller", "Smells Like Teen Spirit",
      "Blinding Lights", "Shape of You",
    ],
    tier4: [
      "Smells So Good", "R U Mine?", "Somebody Told Me", "Nuthin' but a G Thang",
    ],
  },
  "Artists — All": {
    tier1: [
      "The Beatles", "Michael Jackson", "Elvis Presley", "Madonna", "Beyoncé",
      "Taylor Swift", "Rihanna", "Queen", "Whitney Houston", "The Rolling Stones",
      "Prince", "David Bowie", "Bob Marley", "Drake",
    ],
    tier4: [
      "Chic", "Joy Division", "The Smiths", "Pulp", "Talking Heads",
    ],
  },
  "NFL — Current": {
    tier1: [
      "Patrick Mahomes", "Josh Allen", "Lamar Jackson", "Joe Burrow", "Justin Jefferson",
      "Travis Kelce", "Ja'Marr Chase", "Myles Garrett", "Micah Parsons",
    ],
    tier4: [
      "Za'Darius Smith", "Justin Simmons", "Geno Smith", "Nick Chubb",
    ],
  },
  "NFL — All-Time": {
    tier1: [
      "Tom Brady", "Jerry Rice", "Peyton Manning", "Joe Montana", "Jim Brown",
      "Lawrence Taylor", "Walter Payton", "Barry Sanders", "John Elway", "Dan Marino",
      "Aaron Rodgers", "Randy Moss",
    ],
    tier4: [
      "Night Train Lane", "Kellen Winslow", "Forrest Gregg",
    ],
  },
  "F1 — Current": {
    tier1: ["Max Verstappen", "Lewis Hamilton", "Lando Norris", "Charles Leclerc", "Oscar Piastri", "George Russell"],
    tier4: ["Arvid Lindblad", "Gabriel Bortoleto", "Franco Colapinto"],
  },
  "F1 — All-Time": {
    tier1: [
      "Michael Schumacher", "Lewis Hamilton", "Ayrton Senna", "Alain Prost", "Sebastian Vettel",
      "Max Verstappen", "Juan Manuel Fangio", "Niki Lauda",
    ],
    tier4: [
      "Vittorio Brambilla", "Tom Pryce", "Ludovico Scarfiotti", "Piero Taruffi", "Luigi Fagioli",
    ],
  },
  "Tennis — Current": {
    tier1: ["Jannik Sinner", "Carlos Alcaraz", "Novak Djokovic", "Iga Świątek", "Aryna Sabalenka", "Coco Gauff"],
    tier4: [
      "Zhang Zhizhen", "Roman Safiullin", "Yannick Hanfmann", "Aleksandar Vukic",
      "Magda Linette", "Peyton Stearns",
    ],
  },
  "Tennis — All-Time": {
    tier1: [
      "Roger Federer", "Rafael Nadal", "Novak Djokovic", "Pete Sampras", "Serena Williams",
      "Steffi Graf", "Martina Navratilova", "Björn Borg", "Rod Laver",
    ],
    tier4: [
      "Alice Marble", "Doris Hart", "Louise Brough", "Shirley Fry", "Nancy Richey",
    ],
  },
  "Football — All-Time": {
    tier1: [
      "Pelé", "Diego Maradona", "Lionel Messi", "Cristiano Ronaldo", "Johan Cruyff",
      "Zinedine Zidane", "Ronaldo Nazário", "Franz Beckenbauer", "Ferenc Puskás",
      "Alfredo Di Stéfano", "Michel Platini", "Ronaldinho", "George Best", "Eusébio",
      "Gerd Müller", "Paolo Maldini", "Roberto Baggio", "Xavi", "Andrés Iniesta", "Thierry Henry",
    ],
  },
  "Football — Current": {
    tier1: [
      "Kylian Mbappé", "Erling Haaland", "Lionel Messi", "Vinícius Júnior", "Jude Bellingham",
      "Kevin De Bruyne", "Mohamed Salah", "Harry Kane", "Robert Lewandowski", "Neymar",
      "Bukayo Saka", "Cole Palmer", "Rodri", "Pedri", "Lamine Yamal",
    ],
  },
  "Premier League — Current": {
    tier1: [
      "Haaland (Man City)", "Palmer (Chelsea)", "Saka (Arsenal)", "Foden (Man City)",
      "Rashford (Man Utd)", "Isak (Liverpool)", "Wirtz (Liverpool)", "Mbeumo (Man Utd)",
      "Watkins (Aston Villa)", "Ødegaard (Arsenal)", "Rice (Arsenal)", "Gyökeres (Arsenal)",
      "Szoboszlai (Liverpool)", "Mac Allister (Liverpool)", "Gakpo (Liverpool)",
      "Martinelli (Arsenal)", "Havertz (Arsenal)", "Enzo (Chelsea)", "Caicedo (Chelsea)",
      "B.Fernandes (Man Utd)", "Doku (Man City)",
    ],
  },
  "Premier League — All-Time": {
    tier1: [
      "Thierry Henry", "Alan Shearer", "Steven Gerrard", "Frank Lampard", "Ryan Giggs",
      "Wayne Rooney", "Eric Cantona", "Roy Keane", "Patrick Vieira", "Dennis Bergkamp",
      "Didier Drogba", "Sergio Agüero", "Peter Schmeichel", "John Terry", "Kevin De Bruyne",
      "Mohamed Salah", "Harry Kane", "Ian Wright", "Virgil van Dijk",
    ],
  },
  "La Liga — Current": {
    tier1: [
      "Kylian Mbappé", "Jude Bellingham", "Vinícius Júnior", "Robert Lewandowski", "Pedri",
      "Lamine Yamal", "Raphinha", "Antoine Griezmann",
    ],
  },
  "La Liga — All-Time": {
    tier1: [
      "Cristiano Ronaldo", "Alfredo Di Stéfano", "Zinedine Zidane", "Lionel Messi", "Raúl",
      "Ronaldinho", "Iker Casillas", "Xavi", "Andrés Iniesta", "Ronaldo Nazário",
    ],
  },
  "Bundesliga — All-Time": {
    tier1: [
      "Franz Beckenbauer", "Gerd Müller", "Karl-Heinz Rummenigge", "Robert Lewandowski",
      "Manuel Neuer", "Bastian Schweinsteiger", "Lothar Matthäus", "Michael Ballack",
    ],
  },
  "Serie A — All-Time": {
    tier1: [
      "Alessandro Del Piero", "Gianluigi Buffon", "Paolo Rossi", "Roberto Baggio",
      "Francesco Totti", "Paolo Maldini", "Andrea Pirlo", "Zlatan Ibrahimović", "Diego Maradona",
    ],
  },
  "Ligue 1 — All-Time": {
    tier1: ["Kylian Mbappé", "Neymar", "Zlatan Ibrahimović", "Michel Platini", "Just Fontaine"],
  },
  "England — All-Time": {
    tier1: [
      "Bobby Moore", "Bobby Charlton", "Wayne Rooney", "David Beckham", "Alan Shearer",
      "Gary Lineker", "Harry Kane", "Steven Gerrard", "Frank Lampard", "Paul Gascoigne",
    ],
  },
  "Spain — All-Time": {
    tier1: [
      "Andrés Iniesta", "Xavi", "Iker Casillas", "Raúl", "Sergio Ramos", "David Villa", "Fernando Torres",
    ],
  },
  "France — All-Time": {
    tier1: [
      "Zinedine Zidane", "Michel Platini", "Kylian Mbappé", "Thierry Henry", "Just Fontaine",
      "Antoine Griezmann", "Didier Deschamps",
    ],
  },
  "Germany — All-Time": {
    tier1: [
      "Franz Beckenbauer", "Gerd Müller", "Miroslav Klose", "Lothar Matthäus", "Manuel Neuer",
      "Bastian Schweinsteiger", "Karl-Heinz Rummenigge",
    ],
  },
  "Italy — All-Time": {
    tier1: [
      "Paolo Maldini", "Roberto Baggio", "Francesco Totti", "Andrea Pirlo", "Gianluigi Buffon",
      "Alessandro Del Piero", "Paolo Rossi",
    ],
  },
  "Brazil — All-Time": {
    tier1: [
      "Pelé", "Ronaldo Nazário", "Ronaldinho", "Zico", "Romário", "Kaká", "Neymar", "Rivaldo", "Cafu",
    ],
  },
  "Argentina — All-Time": {
    tier1: ["Diego Maradona", "Lionel Messi", "Gabriel Batistuta", "Ángel Di María", "Sergio Agüero"],
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
