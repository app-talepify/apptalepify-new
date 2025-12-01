const SUBSCRIPTION_PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Aylık',
    price: 199.00,
  },
  quarterly: {
    id: 'quarterly',
    name: '3 Aylık',
    price: 500.00,
  },
  semiannual: {
    id: 'semiannual',
    name: '6 Aylık',
    price: 990.00,
  },
  yearly: {
    id: 'yearly',
    name: 'Yıllık Pro',
    price: 1599.00,
  },
};

const PLAN_DURATIONS = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

module.exports = {
  SUBSCRIPTION_PLANS,
  PLAN_DURATIONS,
};
