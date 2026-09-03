// Seed Migration Script: Migrate data from lowdb to Supabase
// Run with: node seedMigration.js

const { supabase } = require('./supabase');
const { db, seed } = require('./db');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

async function migrateData() {
  try {
    console.log('🚀 Starting data migration from lowdb to Supabase...\n');

    // Ensure lowdb is seeded
    seed();

    // Helper function to get all data from lowdb
    const getLowdbData = (table) => {
      return db.get(table).value() || [];
    };

    // Migrate Restaurants
    console.log('📦 Migrating restaurants...');
    const restaurants = getLowdbData('restaurants');
    if (restaurants.length > 0) {
      const formattedRestaurants = restaurants.map(r => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        type: r.type,
        description: r.description,
        tags: r.tags,
        rating: r.rating,
        price_range: r.priceRange,
        is_open: r.isOpen,
        closing_time: r.closingTime,
        status: r.status || 'active'
      }));

      const { data, error } = await supabase
        .from('restaurants')
        .upsert(formattedRestaurants, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || restaurants.length} restaurants`);
    }

    // Migrate Branches
    console.log('📦 Migrating branches...');
    const branches = getLowdbData('branches');
    if (branches.length > 0) {
      const formattedBranches = branches.map(b => ({
        id: b.id,
        restaurant_id: b.restaurantId,
        name: b.name,
        address: b.address
      }));

      const { data, error } = await supabase
        .from('branches')
        .upsert(formattedBranches, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || branches.length} branches`);
    }

    // Migrate Users
    console.log('📦 Migrating users...');
    const users = getLowdbData('users');
    if (users.length > 0) {
      const formattedUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        restaurant_id: u.restaurantId,
        branch_id: u.branchId,
        password_hash: u.passwordHash,
        active: u.active !== false
      }));

      const { data, error } = await supabase
        .from('users')
        .upsert(formattedUsers, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || users.length} users`);
    }

    // Migrate Tables
    console.log('📦 Migrating tables...');
    const tables = getLowdbData('tables');
    if (tables.length > 0) {
      const formattedTables = tables.map(t => ({
        id: t.id,
        branch_id: t.branchId,
        number: t.number,
        seats: t.seats,
        status: t.status || 'available',
        assigned_waiter_id: t.assignedWaiterId,
        qr_code: t.qrCode
      }));

      const { data, error } = await supabase
        .from('tables')
        .upsert(formattedTables, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || tables.length} tables`);
    }

    // Migrate Menu Categories
    console.log('📦 Migrating menu categories...');
    const categories = getLowdbData('menuCategories');
    if (categories.length > 0) {
      const formattedCategories = categories.map(c => ({
        id: c.id,
        branch_id: c.branchId,
        name: c.name
      }));

      const { data, error } = await supabase
        .from('menu_categories')
        .upsert(formattedCategories, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || categories.length} menu categories`);
    }

    // Migrate Ingredients
    console.log('📦 Migrating ingredients...');
    const ingredients = getLowdbData('ingredients');
    if (ingredients.length > 0) {
      const formattedIngredients = ingredients.map(i => ({
        id: i.id,
        branch_id: i.branchId,
        name: i.name,
        unit: i.unit,
        stock: i.stock,
        low_stock_threshold: i.lowStockThreshold
      }));

      const { data, error } = await supabase
        .from('ingredients')
        .upsert(formattedIngredients, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || ingredients.length} ingredients`);
    }

    // Migrate Menu Items
    console.log('📦 Migrating menu items...');
    const menuItems = getLowdbData('menuItems');
    if (menuItems.length > 0) {
      const formattedMenuItems = menuItems.map(m => ({
        id: m.id,
        branch_id: m.branchId,
        category_id: m.categoryId,
        name: m.name,
        description: m.description,
        price: m.price,
        veg: m.veg,
        mode: m.mode,
        status: m.status,
        prep_time: m.prepTime,
        recipe: m.recipe,
        submitted_by: m.submittedBy,
        rating: m.rating,
        available_quantity: m.availableQuantity,
        availability_status: m.availabilityStatus,
        updated_by: m.updatedBy,
        stock_scheduled_until: m.stockScheduledUntil
      }));

      const { data, error } = await supabase
        .from('menu_items')
        .upsert(formattedMenuItems, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || menuItems.length} menu items`);
    }

    // Migrate Orders
    console.log('📦 Migrating orders...');
    const orders = getLowdbData('orders');
    if (orders.length > 0) {
      const formattedOrders = orders.map(o => ({
        id: o.id,
        branch_id: o.branchId,
        restaurant_id: o.restaurantId,
        table_id: o.tableId,
        customer_id: o.customerId,
        waiter_id: o.waiterId,
        items: o.items,
        total: o.total,
        status: o.status,
        order_type: o.orderType,
        special_requests: o.specialRequests
      }));

      const { data, error } = await supabase
        .from('orders')
        .upsert(formattedOrders, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || orders.length} orders`);
    }

    // Migrate Coupons
    console.log('📦 Migrating coupons...');
    const coupons = getLowdbData('coupons');
    if (coupons.length > 0) {
      const formattedCoupons = coupons.map(c => ({
        id: c.id,
        restaurant_id: c.restaurantId,
        code: c.code,
        discount_type: c.discountType,
        discount_value: c.discountValue,
        description: c.description,
        max_uses: c.maxUses,
        used_count: c.usedCount,
        active: c.active,
        min_order_value: c.minOrderValue,
        valid_till: c.validTill
      }));

      const { data, error } = await supabase
        .from('coupons')
        .upsert(formattedCoupons, { onConflict: 'id' });
      
      if (error) throw error;
      console.log(`  ✅ Migrated ${data?.length || coupons.length} coupons`);
    }

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📝 Next steps:');
    console.log('   1. Set USE_SUPABASE=true in your .env file');
    console.log('   2. Restart the server: npm start');
    console.log('   3. Test the application thoroughly');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateData();
