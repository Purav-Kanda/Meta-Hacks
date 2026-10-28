export interface Question {
  prompt: string;
  /** exactly three answers, shown on buttons A, B, C */
  options: [string, string, string];
  /** index (0-2) of the right option */
  correct: 0 | 1 | 2;
}

// PLACEHOLDER questions so piece 2 is playable. Swap in your own 10 here,
// nothing else in the game needs to change. Keep them real-person-free and
// brand-free (competition rules), and hard enough that guessing mostly fails.
export const QUESTIONS: Question[] = [
  { prompt: 'What is the 7th prime number?', options: ['13', '17', '19'], correct: 1 },
  { prompt: 'How many hearts does an octopus have?', options: ['3', '1', '5'], correct: 0 },
  { prompt: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au'], correct: 2 },
  { prompt: 'Botanically speaking, which of these is a berry?', options: ['Strawberry', 'Banana', 'Raspberry'], correct: 1 },
  { prompt: 'How many bones does an adult human have?', options: ['186', '226', '206'], correct: 2 },
  { prompt: 'What is 12 x 13?', options: ['156', '144', '166'], correct: 0 },
  { prompt: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Pacific', 'Indian'], correct: 1 },
  { prompt: 'What is the square root of 169?', options: ['12', '14', '13'], correct: 2 },
  { prompt: 'Which gas do plants absorb from the air?', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen'], correct: 0 },
  { prompt: 'In which year did the Titanic sink?', options: ['1905', '1921', '1912'], correct: 2 },
];
