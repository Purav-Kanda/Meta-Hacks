export interface Question {
  prompt: string;
  /** exactly three answers, shown on buttons A, B, C */
  options: [string, string, string];
  /** index (0-2) of the right option */
  correct: 0 | 1 | 2;
  /** a scribbled study note for the crib sheet: a fact to learn from, never a letter. Keep it under ~45 characters. */
  note?: string;
}

// The pool the exam draws from. Each attempt deals `questionCount` random questions from
// here, in random order, with the A/B/C options shuffled too. Add as many as you like:
// no real people, no brands (competition rules). Keep options short (about 20 characters)
// so they fit on the buttons.
export const QUESTIONS: Question[] = [
  // --- real facts ---
  { prompt: 'How many hearts does an octopus have?', options: ['3', '1', '5'], correct: 0 , note: 'Octopus: 3 hearts (2 gills + 1 body)' },
  { prompt: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au'], correct: 2 , note: 'Gold = Au (Latin: aurum)' },
  { prompt: 'Botanically speaking, which of these is a berry?', options: ['Strawberry', 'Banana', 'Raspberry'], correct: 1 , note: 'Real berries: banana, grape. NOT strawberry' },
  { prompt: 'How many bones does an adult human have?', options: ['186', '226', '206'], correct: 2 , note: 'Adult skeleton: 206 bones' },
  { prompt: 'What is 12 x 13?', options: ['156', '144', '166'], correct: 0 , note: '12 x 13 = 12x10 + 12x3' },
  { prompt: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Pacific', 'Indian'], correct: 1 , note: 'Biggest ocean = the Pacific' },
  { prompt: 'What is the square root of 169?', options: ['12', '14', '13'], correct: 2 , note: 'Squares: 11x11=121, 12x12=144, 13x13=169' },
  { prompt: 'Which gas do plants absorb from the air?', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen'], correct: 0 , note: 'Plants breathe in CO2, out O2' },
  { prompt: 'In which year did the Titanic sink?', options: ['1905', '1921', '1912'], correct: 2 , note: 'Titanic sank in April 1912' },
  { prompt: 'What is the 7th prime number?', options: ['13', '17', '19'], correct: 1 , note: 'Primes: 2 3 5 7 11 13 17 19 ...' },
  { prompt: 'How many legs does a spider have?', options: ['6', '8', '10'], correct: 1 , note: 'Spiders: 8 legs. Insects: 6' },
  { prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars'], correct: 2 , note: 'Red Planet = Mars (rusty dust)' },
  { prompt: 'What is 9 x 9?', options: ['81', '72', '99'], correct: 0 , note: '9s trick: 9 x 9 = 90 - 9' },
  { prompt: 'How many days are in a leap year?', options: ['365', '366', '364'], correct: 1 , note: 'Leap year = 365 days + 1 extra' },
  // --- goofy but with a real answer ---
  { prompt: 'What do you call a group of crows?', options: ['A gossip', 'A murder', 'A committee'], correct: 1 , note: 'Group of crows = a murder (spooky)' },
  { prompt: 'What do you call a group of flamingos?', options: ['A flamboyance', 'A pinkness', 'A flock-tail'], correct: 0 , note: 'Group of flamingos = a flamboyance' },
  { prompt: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Wi-Fi router'], correct: 1 , note: 'Mitochondria = powerhouse of the cell' },
  { prompt: 'Which of these is NOT a fruit?', options: ['Mango', 'Potato', 'Pear'], correct: 1 , note: 'Potato is a tuber, not a fruit' },
  { prompt: 'What has hands but cannot clap?', options: ['A clock', 'A glove', 'A ghost'], correct: 0 , note: 'Riddle: hands but can\'t clap = a clock' },
  { prompt: 'What gets wetter the more it dries?', options: ['A fish', 'A towel', 'Soap'], correct: 1 , note: 'Riddle: gets wetter as it dries = a towel' },
  { prompt: 'Which month has 28 days?', options: ['February', 'None', 'All of them'], correct: 2 , note: 'Every month has 28 days (or more!)' },
  { prompt: 'What do you call a sleeping bull?', options: ['A bulldozer', 'A cow-ch potato', 'A bull-nap'], correct: 0 , note: 'Sleeping bull = a bulldozer (bull-dozer)' },
  // --- classroom jokes (free points if you read carefully) ---
  { prompt: 'What is the #1 rule of this exam?', options: ['Own paper only', "Everyone's paper", 'The ceiling'], correct: 0 , note: 'Rule #1: eyes on YOUR OWN paper' },
  { prompt: 'You drop your pencil. What now?', options: ['Scream loudly', 'Ask quietly', 'Eat it'], correct: 1 , note: 'Dropped pencil? Ask quietly' },
  { prompt: 'What sound does a duck make?', options: ['Moo', 'Quack', 'Meow'], correct: 1 , note: 'Duck says QUACK' },
  { prompt: 'Who is watching you right now?', options: ['Nobody', 'A ghost', 'The teacher'], correct: 2 , note: 'The teacher watches everybody' },
  // --- more goofy facts, group names, riddles and puns (the funny answer is often the real one) ---
  { prompt: "What do you call a group of owls?", options: ["A parliament", "A hoot-down", "A board meeting"], correct: 0, note: "Group of owls = a parliament" },
  { prompt: "What do you call a group of ravens?", options: ["A snackpack", "An unkindness", "A gloom"], correct: 1, note: "Group of ravens = an unkindness" },
  { prompt: "What do you call a group of pandas?", options: ["A bamboozle", "A nap", "An embarrassment"], correct: 2, note: "Group of pandas = an embarrassment" },
  { prompt: "What do you call a group of ferrets?", options: ["A business", "A fluff", "A sneak"], correct: 0, note: "Group of ferrets = a business" },
  { prompt: "What do you call a group of porcupines?", options: ["A pokey", "A prickle", "A cactus"], correct: 1, note: "Group of porcupines = a prickle" },
  { prompt: "What do you call a group of giraffes?", options: ["A skyscraper", "A neck", "A tower"], correct: 2, note: "Group of giraffes = a tower" },
  { prompt: "What do you call a group of cats?", options: ["A clowder", "A meow-ment", "A fluffle"], correct: 0, note: "Group of cats = a clowder" },
  { prompt: "What do you call a group of jellyfish?", options: ["A wiggle", "A smack", "A jelly-jam"], correct: 1, note: "Group of jellyfish = a smack" },
  { prompt: "What shape is wombat poop?", options: ["Spheres", "Triangles", "Cubes"], correct: 2, note: "Wombat poop is cube-shaped" },
  { prompt: "Which animal has fingerprints like a human?", options: ["Koala", "Panda", "Raccoon"], correct: 0, note: "Koalas have human-like fingerprints" },
  { prompt: "Which of these can NOT jump?", options: ["Frog", "Elephant", "Cricket"], correct: 1, note: "Elephants cannot jump" },
  { prompt: "Goldfish memory lasts about...", options: ["3 seconds", "3 minutes", "3 months"], correct: 2, note: "Goldfish remember for months" },
  { prompt: "A snail can sleep for up to...", options: ["3 years", "3 days", "3 weeks"], correct: 0, note: "Snails can sleep up to 3 years" },
  { prompt: "How do dolphins sleep?", options: ["Upside down", "With half a brain", "They never do"], correct: 1, note: "Dolphins sleep one brain half at a time" },
  { prompt: "How do bees tell friends where food is?", options: ["A group chat", "Tiny emails", "A waggle dance"], correct: 2, note: "Bees waggle-dance to give directions" },
  { prompt: "The only mammal that truly flies is...", options: ["A bat", "A flying squirrel", "A sugar glider"], correct: 0, note: "Bats fly. Squirrels only glide" },
  { prompt: "Who has more bones?", options: ["An adult", "A newborn baby", "Same amount"], correct: 1, note: "Babies ~300 bones, adults 206" },
  { prompt: "What is the funny bone, really?", options: ["A muscle", "A rib", "A nerve"], correct: 2, note: "Funny bone = the ulnar nerve" },
  { prompt: "What is the largest organ you have?", options: ["Skin", "Liver", "Brain"], correct: 0, note: "Biggest organ = skin" },
  { prompt: "Where are a strawberry's seeds?", options: ["Inside", "Outside", "It has none"], correct: 1, note: "Strawberry seeds sit on the outside" },
  { prompt: "What is a peanut, really?", options: ["A nut", "A berry", "A legume"], correct: 2, note: "Peanut = legume (bean family)" },
  { prompt: "Botanically, a tomato is a...", options: ["Fruit", "Vegetable", "Root"], correct: 0, note: "Tomato = fruit (seeds inside)" },
  { prompt: "Which planet has a day longer than its year?", options: ["Mercury", "Venus", "Mars"], correct: 1, note: "Venus spins slower than it orbits" },
  { prompt: "Which planet is the hottest?", options: ["Mercury", "Mars", "Venus"], correct: 2, note: "Venus is hotter than Mercury" },
  { prompt: "Which planet spins on its side?", options: ["Uranus", "Saturn", "Neptune"], correct: 0, note: "Uranus rolls on its side" },
  { prompt: "What can NOT travel through empty space?", options: ["Light", "Sound", "Gravity"], correct: 1, note: "No air in space = no sound" },
  { prompt: "Why is the sky blue?", options: ["It reflects the sea", "Blue dust", "Light scattering"], correct: 2, note: "Air scatters blue light the most" },
  { prompt: "Which is hotter?", options: ["A lightning bolt", "The Sun's surface", "A campfire"], correct: 0, note: "Lightning is hotter than the Sun" },
  { prompt: "What does a barometer measure?", options: ["Bar sizes", "Air pressure", "Hunger"], correct: 1, note: "Barometer = air pressure" },
  { prompt: "What is the symbol for sodium?", options: ["So", "Sd", "Na"], correct: 2, note: "Sodium = Na (Latin: natrium)" },
  { prompt: "What is the symbol for iron?", options: ["Fe", "Ir", "In"], correct: 0, note: "Iron = Fe (Latin: ferrum)" },
  { prompt: "Which country has the most time zones?", options: ["Russia", "France", "USA"], correct: 1, note: "France: 12+ with overseas lands" },
  { prompt: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra"], correct: 2, note: "Australia's capital = Canberra" },
  { prompt: "What is the capital of Canada?", options: ["Ottawa", "Toronto", "Montreal"], correct: 0, note: "Canada's capital = Ottawa" },
  { prompt: "What is the smallest country?", options: ["Monaco", "Vatican City", "Malta"], correct: 1, note: "Smallest country = Vatican City" },
  { prompt: "The shortest war in history lasted about...", options: ["4 days", "2 weeks", "40 minutes"], correct: 2, note: "Anglo-Zanzibar war: ~40 minutes" },
  { prompt: "What is 7 x 8?", options: ["56", "54", "63"], correct: 0, note: "7 x 8 = 56 (5,6,7,8)" },
  { prompt: "What comes next: 1 1 2 3 5 8 ?", options: ["11", "13", "15"], correct: 1, note: "Fibonacci: add the last two" },
  { prompt: "What is 2 to the power of 10?", options: ["1000", "2048", "1024"], correct: 2, note: "2^10 = 1024" },
  { prompt: "What is XL in Roman numerals?", options: ["40", "60", "14"], correct: 0, note: "XL = 50 - 10 = 40" },
  { prompt: "How many sides does an octagon have?", options: ["6", "8", "10"], correct: 1, note: "Octa = 8 (stop sign)" },
  { prompt: "What is 15% of 200?", options: ["20", "35", "30"], correct: 2, note: "10% = 20, 5% = 10, so 30" },
  { prompt: "What do you call a fake noodle?", options: ["An impasta", "A spaghetti-not", "A noodle-ish"], correct: 0, note: "Fake noodle = an impasta" },
  { prompt: "Why did the scarecrow win an award?", options: ["He was very scary", "Outstanding in a field", "Free corn"], correct: 1, note: "Scarecrow: outstanding in his field" },
  { prompt: "What do you call a bear with no teeth?", options: ["A roar-less", "A bare bear", "A gummy bear"], correct: 2, note: "No-teeth bear = gummy bear" },
  { prompt: "Why can't you trust stairs?", options: ["Always up to something", "They creak", "They go both ways"], correct: 0, note: "Stairs: always up to something" },
  { prompt: "What did zero say to eight?", options: ["You are round", "Nice belt", "Call me hero"], correct: 1, note: "Zero to eight: nice belt (8 has a belt)" },
  { prompt: "Why was six afraid of seven?", options: ["Seven is bigger", "It owed money", "Seven ate nine"], correct: 2, note: "7 8 9: seven ATE nine" },
  { prompt: "What do you call a pig that does karate?", options: ["A pork chop", "A ham-kick", "Bacon-fu"], correct: 0, note: "Karate pig = pork chop" },
  { prompt: "What do you call two banana peels?", options: ["A split", "A pair of slippers", "Banana shoes"], correct: 1, note: "Two peels = a pair of slippers" },
  { prompt: "What kind of tree fits in your hand?", options: ["A twig", "A bonsai", "A palm"], correct: 2, note: "Palm tree = palm of your hand" },
  { prompt: "What can you catch but not throw?", options: ["A cold", "A ball", "A frisbee"], correct: 0, note: "Riddle: catch, can't throw = a cold" },
  { prompt: "What has teeth but cannot bite?", options: ["A shark", "A comb", "A zipper-dog"], correct: 1, note: "Riddle: teeth, no bite = a comb" },
  { prompt: "What gets bigger the more you take away?", options: ["A pile", "A debt", "A hole"], correct: 2, note: "Riddle: take away, gets bigger = a hole" },
  { prompt: "What has keys but cannot open locks?", options: ["A piano", "A mouse", "A wallet"], correct: 0, note: "Riddle: keys, no locks = a piano" },
  { prompt: "The more of me there is, the less you see.", options: ["Fog-lights", "Darkness", "A hat"], correct: 1, note: "Riddle: more of me, less you see = dark" },
  { prompt: "What has a neck but no head?", options: ["A cat", "A pencil", "A bottle"], correct: 2, note: "Riddle: neck, no head = a bottle" },
  { prompt: "The teacher has eyes in the back of her...", options: ["Glasses", "Head", "Mind"], correct: 0, note: "Teachers see EVERYTHING (allegedly)" },
  { prompt: "What is the safest way to peek?", options: ["Stare for a minute", "Wave at the teacher", "Slowly, one glance"], correct: 2, note: "One quick glance, then back to paper" },
];

/** one exam's worth: random questions, random order, shuffled options (correct index follows its option) */
export function dealQuestions(pool: readonly Question[], count: number, rng: () => number = Math.random): Question[] {
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(count, pool.length)).map((qi) => {
    const q = pool[qi];
    const perm = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    return {
      prompt: q.prompt,
      options: [q.options[perm[0]], q.options[perm[1]], q.options[perm[2]]] as [string, string, string],
      correct: perm.indexOf(q.correct) as 0 | 1 | 2,
      note: q.note,
    };
  });
}
