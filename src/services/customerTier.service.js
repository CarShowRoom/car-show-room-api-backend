import { CUSTOMER_TIERS } from "../constants/customerTiers.js";

export const getTierMultiplier = (tier) => {
  return CUSTOMER_TIERS[tier]?.multiplier ?? 1;
};

export const getEffectiveLimit = (baseLimit, tier) => {
  return baseLimit * getTierMultiplier(tier);
};
