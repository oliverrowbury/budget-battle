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
  "MLB — Current": {
    tier1: [
      "Shohei Ohtani", "Aaron Judge", "Mookie Betts", "Juan Soto", "Bobby Witt Jr.",
      "Ronald Acuña Jr.", "Freddie Freeman", "Gunnar Henderson", "Paul Skenes",
      "Gerrit Cole", "Zack Wheeler", "Corbin Burnes", "José Ramírez",
    ],
  },
  "MLB — All-Time": {
    tier1: [
      "Babe Ruth", "Willie Mays", "Hank Aaron", "Ted Williams", "Lou Gehrig", "Ty Cobb",
      "Mickey Mantle", "Barry Bonds", "Sandy Koufax", "Cy Young", "Walter Johnson",
      "Rickey Henderson", "Derek Jeter", "Jackie Robinson", "Roberto Clemente",
      "Mike Trout", "Nolan Ryan",
    ],
  },
  "Rugby — Current": {
    tier1: [
      "Antoine Dupont", "Ardie Savea", "Maro Itoje", "Siya Kolisi", "Owen Farrell",
      "Beauden Barrett", "Finn Russell", "Cheslin Kolbe", "Eben Etzebeth",
    ],
  },
  "Rugby — All-Time": {
    tier1: [
      "Jonny Wilkinson", "Dan Carter", "Richie McCaw", "Jonah Lomu", "Brian O'Driscoll",
      "Martin Johnson", "David Campese", "Serge Blanco", "Gareth Edwards", "Colin Meads",
      "Michael Jones",
    ],
  },
  "Cricket — Current": {
    tier1: [
      "Virat Kohli", "Rohit Sharma", "Joe Root", "Steve Smith", "Kane Williamson",
      "Babar Azam", "Pat Cummins", "Jasprit Bumrah", "Ben Stokes",
    ],
  },
  "Cricket — All-Time": {
    tier1: [
      "Don Bradman", "Sachin Tendulkar", "Vivian Richards", "Brian Lara", "Shane Warne",
      "Muttiah Muralitharan", "Wasim Akram", "Garfield Sobers", "Ricky Ponting",
      "Jacques Kallis", "Kapil Dev", "Imran Khan", "AB de Villiers",
    ],
  },
  "Golf — Current": {
    tier1: [
      "Scottie Scheffler", "Rory McIlroy", "Jon Rahm", "Xander Schauffele",
      "Viktor Hovland", "Bryson DeChambeau", "Collin Morikawa", "Brooks Koepka",
    ],
  },
  "Golf — All-Time": {
    tier1: [
      "Jack Nicklaus", "Tiger Woods", "Arnold Palmer", "Gary Player", "Ben Hogan",
      "Sam Snead", "Seve Ballesteros", "Tom Watson", "Nick Faldo",
    ],
  },
  "Athletics — Current": {
    tier1: [
      "Noah Lyles", "Mondo Duplantis", "Armand Duplantis", "Sydney McLaughlin-Levrone",
      "Sydney McLaughlin", "Faith Kipyegon", "Sha'Carri Richardson", "Karsten Warholm",
    ],
  },
  "Athletics — All-Time": {
    tier1: [
      "Usain Bolt", "Carl Lewis", "Michael Johnson", "Jesse Owens", "Sebastian Coe",
      "Haile Gebrselassie", "Eliud Kipchoge", "Florence Griffith-Joyner",
      "Jackie Joyner-Kersee", "Sergey Bubka",
    ],
  },
  "MotoGP — Current": {
    tier1: ["Jorge Martín", "Francesco Bagnaia", "Pecco Bagnaia", "Marc Márquez", "Fabio Quartararo"],
  },
  "MotoGP — All-Time": {
    tier1: [
      "Giacomo Agostini", "Valentino Rossi", "Marc Márquez", "Mick Doohan",
      "Casey Stoner", "Mike Hailwood", "John Surtees",
    ],
  },
  "Movies — All-Time": {
    tier1: [
      "The Godfather", "The Shawshank Redemption", "Pulp Fiction", "The Dark Knight",
      "Schindler's List", "The Godfather Part II", "Citizen Kane", "Goodfellas",
      "Fight Club", "Star Wars", "Jaws", "Titanic",
      "The Lord of the Rings: The Fellowship of the Ring", "12 Angry Men", "Parasite",
      "Oppenheimer",
    ],
  },
  "Shows — All-Time": {
    tier1: [
      "Breaking Bad", "The Wire", "The Sopranos", "Game of Thrones", "The Simpsons",
      "Seinfeld", "Friends", "Chernobyl", "Succession", "The Office", "Better Call Saul",
    ],
  },
  "Best Cast — All-Time": {
    tier1: [
      "Meryl Streep", "Denzel Washington", "Robert De Niro", "Al Pacino", "Jack Nicholson",
      "Daniel Day-Lewis", "Anthony Hopkins", "Tom Hanks", "Leonardo DiCaprio",
      "Cate Blanchett", "Marlon Brando", "Katharine Hepburn",
    ],
  },
  "Build a Movie": {
    tier1: [
      "Meryl Streep", "Denzel Washington", "Leonardo DiCaprio", "Tom Hanks",
      "Won Best Picture", "Instant Cult Classic", "Blockbuster $200M+ Budget",
    ],
  },
  "US Rap Songs": {
    tier1: [
      "Sicko Mode", "God's Plan", "HUMBLE.", "Lose Yourself", "Juicy", "California Love",
      "Empire State of Mind", "N.Y. State of Mind", "Alright", "Not Like Us", "Big Poppa",
      "The Real Slim Shady", "Forgot About Dre", "Still D.R.E.", "Money Trees", "King Kunta",
    ],
  },
  "UK Rap": {
    tier1: ["Stormzy", "Skepta", "Dave", "Central Cee", "Dizzee Rascal", "Wiley", "Kano", "J Hus", "Giggs", "Little Simz"],
  },
  "House Artists": {
    tier1: [
      "Calvin Harris", "David Guetta", "Fisher", "Disclosure", "Daft Punk", "Fatboy Slim",
      "Deadmau5", "Skrillex", "Diplo", "Carl Cox", "Tiësto", "Armin van Buuren", "Frankie Knuckles",
    ],
  },
  "Dad Music": {
    tier1: [
      "Fleetwood Mac", "Eagles", "Dire Straits", "Eric Clapton", "Bruce Springsteen",
      "Journey", "Genesis", "Phil Collins", "The Who", "Elton John", "Billy Joel",
      "Santana", "Beatles",
    ],
  },
  "Drake Songs": {
    tier1: [
      "God's Plan", "Hotline Bling", "One Dance", "In My Feelings", "Started From the Bottom",
      "Nice for What", "Passionfruit", "Take Care", "Best I Ever Had", "Headlines",
      "Nonstop", "Toosie Slide",
    ],
  },
  "Older Artists": {
    tier1: [
      "Frank Sinatra", "Elvis Presley", "The Beatles", "Ray Charles", "Aretha Franklin",
      "Marvin Gaye", "Stevie Wonder", "James Brown", "Bob Dylan", "The Rolling Stones",
      "Jimi Hendrix", "Led Zeppelin", "Pink Floyd", "Queen", "David Bowie", "Michael Jackson",
    ],
  },
  "Older Songs": {
    tier1: [
      "Rock Around the Clock", "Hound Dog", "My Way", "What a Wonderful World",
      "Like a Rolling Stone", "(I Can't Get No) Satisfaction", "Bridge Over Troubled Water",
      "Purple Haze", "God Only Knows", "Somewhere Over the Rainbow",
    ],
  },
  "Video Games": {
    tier1: [
      "The Legend of Zelda: Breath of the Wild", "Grand Theft Auto V", "Minecraft",
      "Red Dead Redemption 2", "The Witcher 3: Wild Hunt", "God of War", "Elden Ring",
      "Half-Life 2", "Ocarina of Time", "Super Mario Odyssey", "The Last of Us",
      "Portal 2", "Tetris", "Dark Souls",
    ],
  },
  "Mobile Games": {
    tier1: [
      "Candy Crush Saga", "Clash of Clans", "Among Us", "Pokémon GO", "Fortnite Mobile",
      "PUBG Mobile", "Genshin Impact", "Roblox", "Subway Surfers", "Angry Birds",
    ],
  },
  "All-Time Games": {
    tier1: ["Chess", "Poker", "Monopoly", "Scrabble", "Risk", "Catan", "Uno", "Dungeons & Dragons", "Magic: The Gathering", "Go"],
  },
  "Jurassic Park — Build a Squad": {
    tier1: [
      "Tyrannosaurus rex", "Velociraptor", "Spinosaurus", "Indominus rex", "Indoraptor",
      "Giganotosaurus", "Mosasaurus", "Alan Grant", "Ian Malcolm", "Owen Grady", "John Hammond",
    ],
    tier4: ["Compsognathus", "Dimorphodon", "Gallimimus", "Cooper the Guide", "Udesky", "Nash"],
  },
  "🐾 Animals": {
    tier1: [
      "Lion", "Tiger", "Elephant", "Grizzly Bear", "Polar Bear", "Great White Shark",
      "Orca", "Crocodile", "Rhinoceros", "Hippopotamus", "Gorilla",
    ],
    tier4: ["Hedgehog", "Meerkat", "Otter", "Sloth", "Beaver", "Raccoon", "Dog", "Cat"],
  },
  "Build a Country": {
    tier1: [
      "Strong Economy", "Universal Healthcare", "Advanced Technology Sector",
      "World-Class Universities", "Strong Military", "Space Program",
      "Fastest Internet in the World", "Best Passport (Visa-Free Travel)",
    ],
    tier4: ["War-torn", "Population of 100", "Size of Vatican City"],
  },
  "🌴 Perfect Life": {
    tier1: [
      "Private Island", "Private Jet", "Yacht", "Penthouse Apartment", "Beachfront Mansion",
      "Generational Wealth", "Own a Football Club", "Immortal", "Never Need to Sleep",
      "Retire at 40", "Earn £100k a Month",
    ],
    tier4: ["Games Room", "A Dog", "Hot Tub", "Vintage Vespa", "Man Cave With a Pool Table"],
  },
  "Build a 5-Course Meal": {
    tier1: [
      "Wagyu Steak", "Lobster Thermidor", "Beef Wellington", "Filet Mignon", "Foie Gras",
      "Chateaubriand", "Truffle Pasta", "Tiramisu", "Soufflé",
    ],
    tier4: ["Big Mac", "Cheeseburger", "Chicken Nuggets", "Hot Dog", "Fish and Chips"],
  },
  "Funniest Squad": {
    tier1: [
      "Robin Williams", "Chris Rock", "Dave Chappelle", "Eddie Murphy", "Jerry Seinfeld",
      "Kevin Hart", "Jim Carrey", "Will Ferrell", "Ricky Gervais", "Larry David",
      "John Cleese", "Rowan Atkinson",
    ],
  },
  "Survival Apocalypse": {
    tier1: [
      "Bear Grylls", "Rick Grimes", "Daryl Dixon", "The Terminator", "Sarah Connor",
      "Geralt of Rivia", "Navy SEAL", "Ellie Williams", "Katniss Everdeen",
      "Indiana Jones", "James Bond", "Jason Bourne",
    ],
  },
  "Build a Garage": {
    tier1: [
      "Bugatti Chiron", "Bugatti Veyron", "Bugatti Divo", "Koenigsegg Jesko", "Pagani Huayra",
      "McLaren P1", "McLaren F1", "Ferrari F40", "Ferrari Enzo", "Ferrari 250 GTO",
      "Lamborghini Miura", "Porsche Carrera GT",
    ],
    tier4: ["Mini Cooper S", "Fiat 500 Abarth", "Volkswagen Beetle Classic", "Mazda MX-5 Miata"],
  },
  "YouTubers": {
    tier1: [
      "MrBeast", "PewDiePie", "Markiplier", "Logan Paul", "KSI", "Jake Paul",
      "IShowSpeed", "Kai Cenat", "Casey Neistat", "Ninja",
    ],
  },
};

// Some pools are filtered/team-scoped views of the exact same real people
// already tiered above (an "NBA — Lakers" pool draws from the same real
// players as "NBA — Current"/"NBA — All-Time"; a "Football — Arsenal" pool
// draws from the same real players as the league/country pools). Rather
// than re-curating the same names dozens of times, these fall back to
// checking the listed pools instead. Some of those pools tag names with a
// club/team suffix like "Xavi (Barcelona)" - stripped before comparing, so
// it still matches a plain "Xavi" tier entry elsewhere.
function stripTag(name) {
  return String(name).replace(/\s*\([^)]*\)\s*$/, "");
}

const NBA_FAMILY = ["NBA — All-Time", "NBA — Current"];
const FOOTBALL_FAMILY = [
  "Football — All-Time", "Football — Current",
  "Premier League — Current", "Premier League — All-Time",
  "La Liga — Current", "La Liga — All-Time",
  "Bundesliga — All-Time", "Serie A — All-Time", "Ligue 1 — All-Time",
  "England — All-Time", "Spain — All-Time", "France — All-Time",
  "Germany — All-Time", "Italy — All-Time", "Brazil — All-Time", "Argentina — All-Time",
];

const familyFallback = {
  "EuroLeague — All-Time": NBA_FAMILY,
  "NBA — All-Time Superstars": NBA_FAMILY,
  "NBA — Current Superstars": NBA_FAMILY,
  "NBA — American Players": NBA_FAMILY,
  "NBA — European Players": NBA_FAMILY,
  "NBA — Non-American Players": NBA_FAMILY,
  "NBA — Current U23": NBA_FAMILY,
  "NBA — Atlanta Hawks": NBA_FAMILY,
  "NBA — Boston Celtics": NBA_FAMILY,
  "NBA — Brooklyn Nets": NBA_FAMILY,
  "NBA — Charlotte Hornets": NBA_FAMILY,
  "NBA — Chicago Bulls": NBA_FAMILY,
  "NBA — Cleveland Cavaliers": NBA_FAMILY,
  "NBA — Dallas Mavericks": NBA_FAMILY,
  "NBA — Denver Nuggets": NBA_FAMILY,
  "NBA — Detroit Pistons": NBA_FAMILY,
  "NBA — Golden State Warriors": NBA_FAMILY,
  "NBA — Houston Rockets": NBA_FAMILY,
  "NBA — Indiana Pacers": NBA_FAMILY,
  "NBA — LA Clippers": NBA_FAMILY,
  "NBA — Los Angeles Lakers": NBA_FAMILY,
  "NBA — Memphis Grizzlies": NBA_FAMILY,
  "NBA — Miami Heat": NBA_FAMILY,
  "NBA — Milwaukee Bucks": NBA_FAMILY,
  "NBA — Minnesota Timberwolves": NBA_FAMILY,
  "NBA — New Orleans Pelicans": NBA_FAMILY,
  "NBA — New York Knicks": NBA_FAMILY,
  "NBA — Oklahoma City Thunder": NBA_FAMILY,
  "NBA — Orlando Magic": NBA_FAMILY,
  "NBA — Philadelphia 76ers": NBA_FAMILY,
  "NBA — Phoenix Suns": NBA_FAMILY,
  "NBA — Portland Trail Blazers": NBA_FAMILY,
  "NBA — Sacramento Kings": NBA_FAMILY,
  "NBA — San Antonio Spurs": NBA_FAMILY,
  "NBA — Toronto Raptors": NBA_FAMILY,
  "NBA — Utah Jazz": NBA_FAMILY,
  "NBA — Washington Wizards": NBA_FAMILY,

  "Football — Arsenal": FOOTBALL_FAMILY,
  "Football — Manchester City": FOOTBALL_FAMILY,
  "Football — Liverpool": FOOTBALL_FAMILY,
  "Football — Chelsea": FOOTBALL_FAMILY,
  "Football — Tottenham Hotspur": FOOTBALL_FAMILY,
  "Football — Real Madrid": FOOTBALL_FAMILY,
  "Football — Barcelona": FOOTBALL_FAMILY,
  "Football — Atlético Madrid": FOOTBALL_FAMILY,
  "Football — Bayern Munich": FOOTBALL_FAMILY,
  "Football — Borussia Dortmund": FOOTBALL_FAMILY,
  "Football — Paris Saint-Germain": FOOTBALL_FAMILY,
  "Football — Juventus": FOOTBALL_FAMILY,
  "Football — AC Milan": FOOTBALL_FAMILY,
  "Football — Inter Milan": FOOTBALL_FAMILY,
  "Top Clubs — All-Time, One Club": FOOTBALL_FAMILY,

  "Tennis — Men's All-Time": ["Tennis — All-Time", "Tennis — Current"],
  "Tennis — Women's All-Time": ["Tennis — All-Time", "Tennis — Current"],

  "IPL — Current": ["Cricket — Current", "Cricket — All-Time"],
  "IPL — All-Time": ["Cricket — All-Time", "Cricket — Current"],

  "F1 — One Team": ["F1 — Current", "F1 — All-Time"],
  "NFL — One Team": ["NFL — Current", "NFL — All-Time"],
  "MLB — One Team": ["MLB — Current", "MLB — All-Time"],
  "Rugby — One Club": ["Rugby — Current", "Rugby — All-Time"],
  "Cricket — One Team": ["Cricket — Current", "Cricket — All-Time"],
};

function tierFromPool(pool, itemName) {
  if (!pool) return 0;
  const stripped = stripTag(itemName);
  if (pool.tier1 && (pool.tier1.includes(itemName) || pool.tier1.includes(stripped))) return 1;
  if (pool.tier2 && (pool.tier2.includes(itemName) || pool.tier2.includes(stripped))) return 2;
  if (pool.tier4 && (pool.tier4.includes(itemName) || pool.tier4.includes(stripped))) return 4;
  return 0;
}

function aiItemTier(gameKey, itemName) {
  const direct = tierFromPool(aiValueTiers[gameKey], itemName);
  if (direct) return direct;

  const fallbackKeys = familyFallback[gameKey];
  if (fallbackKeys) {
    for (const key of fallbackKeys) {
      const t = tierFromPool(aiValueTiers[key], itemName);
      if (t) return t;
    }
  }
  return 3;
}
