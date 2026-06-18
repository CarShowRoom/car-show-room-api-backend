export const CUSTOMER_TIERS = {
  standard: { name: "Standard", multiplier: 1 },
  silver: { name: "Silver", multiplier: 1.5 },
  gold: { name: "Gold", multiplier: 2 },
  platinum: { name: "Platinum", multiplier: 3 },
};

export const TIER_KEYS = Object.freeze(Object.keys(CUSTOMER_TIERS));
