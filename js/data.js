/* Demo content for Torque Table. Everything here can be changed from the Chef's desk. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS = {
  received: 'Received',
  preparing: 'Preparing',
  out: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
/* The only moves the chef may make from each status. */
const NEXT_STATUS = {
  received: ['preparing', 'cancelled'],
  preparing: ['out', 'cancelled'],
  out: ['delivered'],
  delivered: [],
  cancelled: [],
};

function buildSeed() {
  return {
    settings: {
      chefName: 'Mel Essy',
      chefPhone: '+49 40 5550 1020',
      chefEmail: 'hello@torquetable.example',
      radiusKm: 15,
      minOrder: 30,
      base: 'central Hamburg',
      cutoffDay: 4,
      cutoffTime: '20:00',
      deliveryDays: [6, 0],
      windows: ['10:00 – 12:00', '12:00 – 14:00', '16:00 – 18:00'],
      windowCapacity: 4,
      forceClosed: false,
    },
    /* Approximate straight-line distance from Hamburg's Rathaus, and the direction on the map (0 = east, 90 = south). */
    areas: [
      { id: 'a1', name: 'St. Pauli', km: 2.5, deg: 168 },
      { id: 'a2', name: 'Eimsbüttel', km: 4, deg: 225 },
      { id: 'a3', name: 'Altona', km: 4.5, deg: 192 },
      { id: 'a4', name: 'Winterhude', km: 5, deg: 280 },
      { id: 'a5', name: 'Barmbek', km: 5.5, deg: 312 },
      { id: 'a6', name: 'Wilhelmsburg', km: 6, deg: 85 },
      { id: 'a7', name: 'Wandsbek', km: 7, deg: 338 },
      { id: 'a8', name: 'Harburg', km: 11, deg: 100 },
      { id: 'a9', name: 'Blankenese', km: 13, deg: 181 },
      { id: 'a10', name: 'Bergedorf', km: 16, deg: 22 },
      { id: 'a11', name: 'Norderstedt', km: 17, deg: 266 },
      { id: 'a12', name: 'Ahrensburg', km: 21, deg: 318 },
    ],
    meals: [
      { id: 'm1', name: 'Lemon herb chicken', tag: 'Chicken', desc: 'Roasted chicken, rice, greens', price: 12, portion: '450 g · 1 serving',
        ingredients: 'Chicken thigh, lemon, garlic, thyme, basmati rice, green beans, olive oil', allergens: 'None',
        reheat: 'Microwave 3 minutes, or oven 15 minutes at 180°C.', left: 18, published: true },
      { id: 'm2', name: 'Coconut chickpea curry', tag: 'Vegan', desc: 'Coconut curry, rice, vegetables', price: 10, portion: '480 g · 1 serving',
        ingredients: 'Chickpeas, coconut milk, tomato, spinach, onion, ginger, curry spices, jasmine rice', allergens: 'None',
        reheat: 'Microwave 3 minutes, stirring halfway.', left: 20, published: true },
      { id: 'm3', name: 'Beef lasagna', tag: 'Beef', desc: 'Slow-cooked beef, pasta, salad', price: 14, portion: '500 g · 1 serving',
        ingredients: 'Beef mince, tomato, egg pasta, béchamel, parmesan, mixed leaf salad', allergens: 'Gluten, milk, egg',
        reheat: 'Oven 20 minutes at 180°C, covered. Keep the salad cold.', left: 12, published: true },
      { id: 'm4', name: 'Miso glazed salmon', tag: 'Fish', desc: 'Salmon fillet, sesame noodles, pak choi', price: 15, portion: '420 g · 1 serving',
        ingredients: 'Salmon, white miso, soy sauce, wheat noodles, sesame, pak choi, spring onion', allergens: 'Fish, soy, gluten, sesame',
        reheat: 'Microwave 2 minutes. Best eaten within 2 days.', left: 0, published: true },
      { id: 'm5', name: 'Smoky turkey chili', tag: 'Turkey', desc: 'Turkey and bean chili, brown rice', price: 11, portion: '480 g · 1 serving',
        ingredients: 'Turkey mince, kidney beans, tomato, peppers, smoked paprika, cumin, brown rice', allergens: 'None',
        reheat: 'Microwave 3 minutes, stirring halfway. Freezes well.', left: 16, published: true },
      { id: 'm6', name: 'Roasted vegetable quinoa bowl', tag: 'Vegan', desc: 'Roasted vegetables, quinoa, tahini dressing', price: 10, portion: '430 g · 1 serving',
        ingredients: 'Quinoa, sweet potato, courgette, red onion, chickpeas, tahini, lemon', allergens: 'Sesame',
        reheat: 'Eat cold, or microwave 2 minutes without the dressing.', left: 14, published: true },
      { id: 'm7', name: 'Harissa lamb meatballs', tag: 'Lamb', desc: 'Lamb meatballs, couscous, yoghurt', price: 14, portion: '',
        ingredients: 'Lamb mince, harissa, couscous, yoghurt, mint', allergens: '',
        reheat: '', left: 10, published: false },
    ],
    cart: {},
    draft: {},
    checkoutKey: null,
    orders: [],
    mine: [],
    messages: [],
    nextRef: 1001,
    nextMeal: 8,
    seededDemo: false,
  };
}

const DEMO_ORDERS = [
  { name: 'Jonas Petersen', phone: '+49 151 2345 6717', address: 'Osterstraße 48, 2. OG', areaId: 'a2', day: 0, window: 0, notes: 'Please ring at Petersen.', channel: 'SMS',
    items: [['m1', 3], ['m2', 2]] },
  { name: 'Aylin Demir', phone: '+49 160 9876 5022', address: 'Große Bergstraße 152', areaId: 'a3', day: 0, window: 1, notes: '', channel: 'WhatsApp',
    items: [['m3', 2], ['m5', 2]] },
  { name: 'Lena Hoffmann', phone: '+49 172 4455 1180', address: 'Fuhlsbüttler Straße 90', areaId: 'a5', day: 1, window: 0, notes: 'Leave with the neighbour at no. 92 if I am out.', channel: 'SMS',
    items: [['m2', 4], ['m6', 2]] },
];
