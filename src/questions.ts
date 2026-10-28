export interface Question {
  prompt: string;
  /** exactly three answers, shown on buttons A, B, C */
  options: [string, string, string];
  /** index (0-2) of the right option */
  correct: 0 | 1 | 2;
}

// The pool the exam draws from. Each attempt deals `questionCount` random questions from
// here, in random order, with the A/B/C options shuffled too. Add as many as you like:
// no real people, no brands (competition rules). Keep options short (about 20 characters)
// so they fit on the buttons.
export const QUESTIONS: Question[] = [
  // --- real facts ---
  { prompt: 'How many hearts does an octopus have?', options: ['3', '1', '5'], correct: 0 },
  { prompt: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au'], correct: 2 },
  { prompt: 'Botanically speaking, which of these is a berry?', options: ['Strawberry', 'Banana', 'Raspberry'], correct: 1 },
  { prompt: 'How many bones does an adult human have?', options: ['186', '226', '206'], correct: 2 },
  { prompt: 'What is 12 x 13?', options: ['156', '144', '166'], correct: 0 },
  { prompt: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Pacific', 'Indian'], correct: 1 },
  { prompt: 'What is the square root of 169?', options: ['12', '14', '13'], correct: 2 },
  { prompt: 'Which gas do plants absorb from the air?', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen'], correct: 0 },
  { prompt: 'In which year did the Titanic sink?', options: ['1905', '1921', '1912'], correct: 2 },
  { prompt: 'What is the 7th prime number?', options: ['13', '17', '19'], correct: 1 },
  { prompt: 'How many legs does a spider have?', options: ['6', '8', '10'], correct: 1 },
  { prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars'], correct: 2 },
  { prompt: 'What is 9 x 9?', options: ['81', '72', '99'], correct: 0 },
  { prompt: 'How many days are in a leap year?', options: ['365', '366', '364'], correct: 1 },
  // --- goofy but with a real answer ---
  { prompt: 'What do you call a group of crows?', options: ['A gossip', 'A murder', 'A committee'], correct: 1 },
  { prompt: 'What do you call a group of flamingos?', options: ['A flamboyance', 'A pinkness', 'A flock-tail'], correct: 0 },
  { prompt: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Wi-Fi router'], correct: 1 },
  { prompt: 'Which of these is NOT a fruit?', options: ['Mango', 'Potato', 'Pear'], correct: 1 },
  { prompt: 'What has hands but cannot clap?', options: ['A clock', 'A glove', 'A ghost'], correct: 0 },
  { prompt: 'What gets wetter the more it dries?', options: ['A fish', 'A towel', 'Soap'], correct: 1 },
  { prompt: 'Which month has 28 days?', options: ['February', 'None', 'All of them'], correct: 2 },
  { prompt: 'What do you call a sleeping bull?', options: ['A bulldozer', 'A cow-ch potato', 'A bull-nap'], correct: 0 },
  // --- classroom jokes (free points if you read carefully) ---
  { prompt: 'What is the #1 rule of this exam?', options: ['Own paper only', "Everyone's paper", 'The ceiling'], correct: 0 },
  { prompt: 'You drop your pencil. What now?', options: ['Scream loudly', 'Ask quietly', 'Eat it'], correct: 1 },
  { prompt: 'What sound does a duck make?', options: ['Moo', 'Quack', 'Meow'], correct: 1 },
  { prompt: 'Who is watching you right now?', options: ['Nobody', 'A ghost', 'The teacher'], correct: 2 },
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
    };
  });
}
