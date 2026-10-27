// Default reward levels. They are copied to the database by `npm run seed:levels`,
// and the admin can change them later. Until then the server uses these values.
export const DEFAULT_LEVELS = [
  { key: 'bronze', name: 'Bronze', hours: 5, perk: 'Bronze profile badge', bonusPoints: 100, order: 1 },
  { key: 'silver', name: 'Silver', hours: 20, perk: 'Silver badge and a choice of profile color', bonusPoints: 300, order: 2 },
  { key: 'gold', name: 'Gold', hours: 50, perk: 'Vote on which movies mexMovies adds next', bonusPoints: 750, order: 3 },
  { key: 'platinum', name: 'Platinum', hours: 100, perk: 'Early access to new movies and a Platinum badge', bonusPoints: 1500, order: 4 },
];

export const LEVEL_KEYS = DEFAULT_LEVELS.map((l) => l.key);
