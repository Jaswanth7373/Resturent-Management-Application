const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

const hash = (pw) => bcrypt.hashSync(pw, 8);

function seed() {
  db.defaults({
    users: [],
    restaurants: [],
    branches: [],
    tables: [],
    menuCategories: [],
    menuItems: [],
    ingredients: [],
    orders: [],
    reservations: [],
    reviews: [],
    auditLogs: [],
    favorites: [],
    coupons: [],
    payments: [],
    recommendations: [],
    expenses: [],
    attendance: [],
    suppliers: [],
    stockTransactions: [],
    restaurantRequests: [],
    purchaseOrders: []
  }).write();

  // If the database already has restaurants and branches, assume seeded.
  // Otherwise continue to seed demo data so the mobile app always has at least one restaurant.
  if (db.get('restaurants').size().value() > 0 && db.get('branches').size().value() > 0) return; // already seeded

  const restaurantId = nanoid();
  const branchId = nanoid();

  db.get('restaurants').push({
    id: restaurantId,
    name: 'The Copper Fork',
    cuisine: 'Multi-Cuisine',
    type: 'Casual Dining',
    description: 'A warm, brass-and-timber neighbourhood restaurant serving Indian and continental favourites for dine-in and take-away.',
    tags: ['Family Friendly', 'Pocket Friendly', 'Rooftop'],
    rating: 4.5,
    priceRange: '₹₹',
    isOpen: true,
    closingTime: '23:00',
    operatingHours: {
      mon: { open: '10:00', close: '23:00', closed: false },
      tue: { open: '10:00', close: '23:00', closed: false },
      wed: { open: '10:00', close: '23:00', closed: false },
      thu: { open: '10:00', close: '23:00', closed: false },
      fri: { open: '10:00', close: '23:30', closed: false },
      sat: { open: '10:00', close: '23:30', closed: false },
      sun: { open: '10:00', close: '22:30', closed: false },
    },
    status: 'active',
    createdAt: new Date().toISOString()
  }).write();

  db.get('branches').push({
    id: branchId,
    restaurantId,
    name: 'MG Road Branch',
    address: 'MG Road, Bengaluru',
  }).write();

  // Users - one per role, password = "password" for all demo accounts
  const roles = [
    { role: 'super_admin', name: 'Ava Superadmin', email: 'super@demo.com' },
    { role: 'restaurant_admin', name: 'Raj RestaurantAdmin', email: 'admin@demo.com' },
    { role: 'sub_admin', name: 'Sara SubAdmin', email: 'subadmin@demo.com' },
    { role: 'waiter', name: 'Wes Waiter', email: 'waiter@demo.com' },
    { role: 'waiter', name: 'Nina Waiter', email: 'waiter2@demo.com' },
    { role: 'chef', name: 'Chen Chef', email: 'chef@demo.com' },
    { role: 'inventory_manager', name: 'Ivy Inventory', email: 'inventory@demo.com' },
    { role: 'customer', name: 'Cathy Customer', email: 'customer@demo.com' },
  ];
  roles.forEach(r => {
    db.get('users').push({
      id: nanoid(),
      ...r,
      branchId,
      restaurantId,
      passwordHash: hash('password'),
      active: true
    }).write();
  });

  // Tables
  const tableConfigs = [
    { number: 1, seats: 2 }, { number: 2, seats: 2 }, { number: 3, seats: 4 },
    { number: 4, seats: 4 }, { number: 5, seats: 6 }, { number: 6, seats: 8 },
  ];
  tableConfigs.forEach(t => {
    db.get('tables').push({
      id: nanoid(),
      branchId,
      number: t.number,
      seats: t.seats,
      status: 'available', // available, occupied, cleaning, reserved
      assignedWaiterId: null,
      qrCode: `TABLE-${branchId}-${t.number}`
    }).write();
  });

  // Menu categories
  const categories = ['Starters', 'Main Course', 'Breakfast', 'Desserts', 'Drinks'];
  const catIds = {};
  categories.forEach(name => {
    const id = nanoid();
    catIds[name] = id;
    db.get('menuCategories').push({ id, branchId, name }).write();
  });

  // Ingredients
  const ingredients = [
    { name: 'Paneer', unit: 'kg', stock: 20, lowStockThreshold: 5 },
    { name: 'Chicken', unit: 'kg', stock: 15, lowStockThreshold: 5 },
    { name: 'Rice', unit: 'kg', stock: 50, lowStockThreshold: 10 },
    { name: 'Flour', unit: 'kg', stock: 30, lowStockThreshold: 8 },
    { name: 'Milk', unit: 'l', stock: 25, lowStockThreshold: 5 },
    { name: 'Cocoa', unit: 'kg', stock: 4, lowStockThreshold: 2 },
  ];
  const ingIds = {};
  ingredients.forEach(i => {
    const id = nanoid();
    ingIds[i.name] = id;
    db.get('ingredients').push({ id, branchId, ...i }).write();
  });

  // Menu items
  const items = [
    { name: 'Paneer Tikka', category: 'Starters', veg: true, price: 249, mode: 'both', desc: 'Chargrilled cottage cheese with spices.', prepTime: 15, recipe: [{ ing: 'Paneer', qty: 0.2 }], status: 'live', availableQuantity: 18 },
    { name: 'Chicken 65', category: 'Starters', veg: false, price: 279, mode: 'both', desc: 'Spicy deep-fried chicken bites.', prepTime: 18, recipe: [{ ing: 'Chicken', qty: 0.25 }], status: 'live', availableQuantity: 8 },
    { name: 'Butter Chicken', category: 'Main Course', veg: false, price: 399, mode: 'both', desc: 'Creamy tomato chicken curry.', prepTime: 25, recipe: [{ ing: 'Chicken', qty: 0.3 }], status: 'live', availableQuantity: 12 },
    { name: 'Veg Biryani', category: 'Main Course', veg: true, price: 299, mode: 'both', desc: 'Fragrant basmati rice with vegetables.', prepTime: 30, recipe: [{ ing: 'Rice', qty: 0.35 }], status: 'live', availableQuantity: 15 },
    { name: 'Masala Dosa', category: 'Breakfast', veg: true, price: 149, mode: 'dine_in', desc: 'Crispy rice crepe with potato filling.', prepTime: 12, recipe: [{ ing: 'Rice', qty: 0.15 }], status: 'live', availableQuantity: 6 },
    { name: 'Chocolate Lava Cake', category: 'Desserts', veg: true, price: 179, mode: 'both', desc: 'Warm cake with molten chocolate center.', prepTime: 10, recipe: [{ ing: 'Cocoa', qty: 0.08 }, { ing: 'Flour', qty: 0.1 }], status: 'live', availableQuantity: 4 },
    { name: 'Cold Coffee', category: 'Drinks', veg: true, price: 129, mode: 'both', desc: 'Chilled coffee blended with ice cream.', prepTime: 5, recipe: [{ ing: 'Milk', qty: 0.2 }], status: 'live', availableQuantity: 0 },
    { name: 'Truffle Fries', category: 'Starters', veg: true, price: 219, mode: 'both', desc: 'Crispy fries tossed in truffle oil.', prepTime: 12, recipe: [], status: 'pending_approval', submittedBy: 'chef', availableQuantity: 11 },
  ];
  items.forEach(it => {
    db.get('menuItems').push({
      id: nanoid(),
      branchId,
      categoryId: catIds[it.category],
      name: it.name,
      description: it.desc,
      price: it.price,
      veg: it.veg,
      mode: it.mode, // dine_in | take_away | both
      status: it.status, // draft | pending_approval | live | hidden
      prepTime: it.prepTime,
      recipe: it.recipe.map(r => ({ ingredientId: ingIds[r.ing], qty: r.qty })),
      submittedBy: it.submittedBy || null,
      rating: (4 + Math.random()).toFixed(1),
      availableQuantity: it.availableQuantity ?? 15,
      availabilityStatus: 'available',
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      stockScheduledUntil: null
    }).write();
  });

  // Coupons
  db.get('coupons').push({
    id: nanoid(),
    restaurantId,
    code: 'WELCOME10',
    discountType: 'percentage',
    discountValue: 10,
    description: 'Welcome offer - 10% off',
    maxUses: 999,
    usedCount: 0,
    active: true,
    validTill: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  }).write();

  db.get('coupons').push({
    id: nanoid(),
    restaurantId,
    code: 'FLAT50',
    discountType: 'fixed',
    discountValue: 50,
    description: 'Flat ₹50 off on minimum order',
    maxUses: 500,
    usedCount: 0,
    active: true,
    minOrderValue: 300,
    validTill: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  }).write();

  // Suppliers
  const supplierDefs = [
    { name: 'Fresh Farms Pvt Ltd', category: 'Produce & Dairy', phone: '+91 98450 11122', email: 'orders@freshfarms.example' },
    { name: 'Coastal Meats Co.', category: 'Meat & Poultry', phone: '+91 98450 33344', email: 'sales@coastalmeats.example' },
    { name: 'Grainline Wholesale', category: 'Grains & Staples', phone: '+91 98450 55566', email: 'hello@grainline.example' }
  ];
  const supplierIds = {};
  supplierDefs.forEach(s => {
    const id = nanoid();
    supplierIds[s.name] = id;
    db.get('suppliers').push({ id, branchId, ...s, createdAt: new Date().toISOString() }).write();
  });

  // Additional demo restaurant to ensure mobile app always finds at least one
  const demoRestId = nanoid();
  const demoBranchId = nanoid();
  db.get('restaurants').push({
    id: demoRestId,
    name: 'Demo Corner Cafe',
    cuisine: 'Cafe & Bakery',
    type: 'Cafe',
    description: 'Light bites, coffees and quick meals — perfect for testing the mobile app flows.',
    tags: ['Cafe', 'Bakery', 'Quick Bites'],
    rating: 4.2,
    priceRange: '₹',
    isOpen: true,
    status: 'active',
    createdAt: new Date().toISOString()
  }).write();

  db.get('branches').push({
    id: demoBranchId,
    restaurantId: demoRestId,
    name: 'Demo Corner - Main',
    address: 'Demo Street, Test City',
  }).write();

  // Small set of tables for the demo branch
  [1,2,3,4].forEach(num => {
    db.get('tables').push({
      id: nanoid(),
      branchId: demoBranchId,
      number: num,
      seats: num <= 2 ? 2 : 4,
      status: 'available',
      assignedWaiterId: null,
      qrCode: `TABLE-${demoBranchId}-${num}`
    }).write();
  });

  // Demo categories and ingredients
  const demoCats = ['Cafe Starters', 'Cafe Mains', 'Sweets', 'Beverages'];
  const demoCatIds = {};
  demoCats.forEach(name => {
    const id = nanoid(); demoCatIds[name] = id;
    db.get('menuCategories').push({ id, branchId: demoBranchId, name }).write();
  });

  const demoIngredients = [
    { name: 'Coffee Beans', unit: 'kg', stock: 10, lowStockThreshold: 2 },
    { name: 'Milk', unit: 'l', stock: 20, lowStockThreshold: 5 },
    { name: 'Bread', unit: 'pcs', stock: 50, lowStockThreshold: 10 },
    { name: 'Sugar', unit: 'kg', stock: 8, lowStockThreshold: 2 }
  ];
  const demoIngIds = {};
  demoIngredients.forEach(i => {
    const id = nanoid(); demoIngIds[i.name] = id;
    db.get('ingredients').push({ id, branchId: demoBranchId, ...i }).write();
  });

  const demoItems = [
    { name: 'Espresso', category: 'Beverages', veg: true, price: 99, mode: 'both', desc: 'Rich espresso shot.', prepTime: 3, recipe: [{ ing: 'Coffee Beans', qty: 0.02 }], status: 'live', availableQuantity: 30 },
    { name: 'Cappuccino', category: 'Beverages', veg: true, price: 149, mode: 'both', desc: 'Espresso with steamed milk foam.', prepTime: 4, recipe: [{ ing: 'Coffee Beans', qty: 0.02 }, { ing: 'Milk', qty: 0.15 }], status: 'live', availableQuantity: 25 },
    { name: 'Grilled Cheese Sandwich', category: 'Cafe Mains', veg: true, price: 199, mode: 'both', desc: 'Toasted sandwich with melted cheese.', prepTime: 8, recipe: [{ ing: 'Bread', qty: 2 }, { ing: 'Milk', qty: 0.02 }], status: 'live', availableQuantity: 20 },
    { name: 'Chocolate Brownie', category: 'Sweets', veg: true, price: 129, mode: 'both', desc: 'Fudgy chocolate brownie.', prepTime: 10, recipe: [{ ing: 'Sugar', qty: 0.05 }, { ing: 'Milk', qty: 0.02 }], status: 'live', availableQuantity: 12 }
  ];
  demoItems.forEach(it => {
    db.get('menuItems').push({
      id: nanoid(),
      branchId: demoBranchId,
      categoryId: demoCatIds[it.category],
      name: it.name,
      description: it.desc,
      price: it.price,
      veg: it.veg,
      mode: it.mode,
      status: it.status,
      prepTime: it.prepTime,
      recipe: it.recipe.map(r => ({ ingredientId: demoIngIds[r.ing], qty: r.qty })),
      submittedBy: null,
      rating: (4 + Math.random()).toFixed(1),
      availableQuantity: it.availableQuantity ?? 15,
      availabilityStatus: 'available',
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      stockScheduledUntil: null
    }).write();
  });

  console.log('Seed complete. Demo accounts (password: "password"):');
  roles.forEach(r => console.log(`  ${r.role.padEnd(18)} ${r.email}`));
}

module.exports = { db, seed, hash };
