# Supabase Integration Guide

## Overview
This guide helps you migrate the Restaurant Platform from **lowdb** (local JSON database) to **Supabase** (cloud PostgreSQL database).

## Architecture
- **Local Development**: Uses lowdb (file-based database in `/data/db.json`)
- **Cloud Deployment**: Uses Supabase (PostgreSQL on the cloud)
- **Hybrid Mode**: Both can run simultaneously during transition

## Prerequisites
1. ✅ Node.js installed (v14 or higher)
2. ✅ npm packages installed: `npm install`
3. ✅ Supabase account created: https://supabase.com
4. ✅ Supabase project credentials

## Your Supabase Credentials
- **Project URL**: `https://ngegwyvmxtmcfcazsnoe.supabase.co`
- **Public Key**: `sb_publishable_t2_BCAgEZkAS7oWzgWvtQA_RnngA7wm`

---

## Step 1: Set Up Supabase Database Schema

### Option A: Using Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** tab
4. Click **New Query**
5. Copy entire contents of `SUPABASE_SCHEMA.sql` file
6. Paste into the SQL editor
7. Click **Run**
8. Wait for all tables to be created

### Option B: Using SQL File
```bash
# Connect to Supabase using psql CLI
psql -h db.ngegwyvmxtmcfcazsnoe.supabase.co -U postgres -d postgres < SUPABASE_SCHEMA.sql
# When prompted, enter your database password
```

---

## Step 2: Verify Schema Creation

After creating tables, verify they exist:

1. In Supabase Dashboard, go to **Database** → **Tables**
2. You should see all these tables:
   - users
   - restaurants
   - branches
   - tables
   - menu_categories
   - ingredients
   - menu_items
   - orders
   - reservations
   - reviews
   - favorites
   - coupons
   - payments
   - stock_transactions
   - audit_logs
   - suppliers
   - recommendations
   - expenses
   - attendance
   - purchase_orders
   - restaurant_requests

---

## Step 3: Configure Environment Variables

1. **Create `.env` file** in project root (already created for you)
2. Verify it contains:
   ```
   USE_SUPABASE=true
   SUPABASE_URL=https://ngegwyvmxtmcfcazsnoe.supabase.co
   SUPABASE_KEY=sb_publishable_t2_BCAgEZkAS7oWzgWvtQA_RnngA7wm
   ```

---

## Step 4: Migrate Existing Data (Optional)

If you have existing data in lowdb that you want to migrate to Supabase:

```bash
# Run the migration script
node seedMigration.js
```

**What this does:**
- Reads all data from `/data/db.json` (lowdb)
- Transforms lowdb format to Supabase format (camelCase → snake_case)
- Inserts all data into Supabase tables

---

## Step 5: Start the Server

```bash
# Install dependencies
npm install

# Start the server
npm start
```

**Expected output:**
```
✅ Supabase connected successfully
🚀 Server running on http://localhost:3000
```

---

## Step 6: Test the Application

### Test Data Created
When server starts with fresh Supabase database, it automatically seeds demo data:

**Demo Users** (all with password: `password`):
- super@demo.com - Super Admin
- admin@demo.com - Restaurant Admin
- subadmin@demo.com - Sub Admin
- waiter@demo.com - Waiter
- waiter2@demo.com - Waiter
- chef@demo.com - Chef
- inventory@demo.com - Inventory Manager
- customer@demo.com - Customer

**Demo Data Includes:**
- Restaurant: "The Copper Fork"
- Branch: "MG Road Branch"
- 6 Tables (2-8 seats)
- 5 Menu Categories
- 8 Menu Items with initial stock
- 2 Coupons (WELCOME10: 10% off, FLAT50: ₹50 off)
- 3 Suppliers

### Test URLs
1. **Customer Portal**: http://localhost:3000/customer.html
2. **Waiter Interface**: http://localhost:3000/waiter.html
3. **Chef Display**: http://localhost:3000/chef.html
4. **Admin Dashboard**: http://localhost:3000/admin.html
5. **Inventory**: http://localhost:3000/inventory.html

---

## Switching Between Databases

### Use Local Database (lowdb)
```env
USE_SUPABASE=false
```
- Restart server: `npm start`
- Data stored in `/data/db.json`

### Use Cloud Database (Supabase)
```env
USE_SUPABASE=true
```
- Restart server: `npm start`
- Data stored in Supabase PostgreSQL

---

## Troubleshooting

### Problem: "Cannot connect to Supabase"
**Solution:**
1. Verify credentials in `.env` file
2. Check internet connection
3. Ensure Supabase project is active
4. Try: `curl https://ngegwyvmxtmcfcazsnoe.supabase.co/auth/v1/health`

### Problem: "Table not found"
**Solution:**
1. Verify all tables were created in step 1
2. Run schema creation again
3. Check Supabase Dashboard → Tables

### Problem: "Role-based access denied"
**Solution:**
1. Login with correct role
2. Inventory Manager can edit stock
3. Chef can view pending orders
4. Waiter can manage tables and orders

### Problem: "Data not syncing in real-time"
**Solution:**
1. Real-time updates use Socket.io (still works with Supabase)
2. Ensure Socket.io connection is established
3. Check browser console for errors

---

## Performance Tips

1. **Add indexes** for frequently queried fields (already in schema)
2. **Use materialized views** for complex reports
3. **Enable RLS (Row Level Security)** for additional security
4. **Archive old orders** to keep database lean

---

## API Compatibility

All existing API endpoints work with both databases:
- GET /api/users
- POST /api/orders
- PUT /api/orders/:id
- DELETE /api/menus/:id
- etc.

**No frontend changes required!**

---

## Backup & Recovery

### Backup Data to Local
```bash
# Export Supabase data to CSV from dashboard
# Or use: pg_dump to create SQL dump
```

### Restore from Backup
1. Upload CSV files to Supabase
2. Or run SQL dump file

---

## Production Deployment

### When Ready for Production:

1. **Create separate Supabase project** for production
2. **Update `.env` with production credentials**:
   ```
   SUPABASE_URL=your_production_url
   SUPABASE_KEY=your_production_key
   ```
3. **Set strong JWT_SECRET**:
   ```
   JWT_SECRET=your_very_long_random_secret_key_min_32_chars
   ```
4. **Deploy to cloud** (Heroku, Railway, Vercel, etc.)
5. **Monitor logs** in Supabase Dashboard

---

## Files Modified/Created

### New Files:
- `.env` - Environment variables (YOUR CREDENTIALS)
- `.env.example` - Example configuration
- `supabase.js` - Supabase client initialization
- `dbAdapter.js` - Unified database interface
- `seedMigration.js` - Data migration script
- `SUPABASE_SCHEMA.sql` - Database schema for Supabase

### Unchanged:
- All route files continue to work as-is
- Frontend files (HTML/JS) need no changes
- Socket.io configuration remains same

---

## Support

For Supabase issues:
- Docs: https://supabase.com/docs
- Community: https://discord.supabase.io
- Status: https://status.supabase.io

For Restaurant Platform issues:
- Check application logs in terminal
- Review request/response in browser DevTools
- Check database tables in Supabase Dashboard

---

## Next Steps

1. ✅ Create Supabase account and project
2. ✅ Run SUPABASE_SCHEMA.sql to create tables
3. ✅ Set credentials in `.env`
4. ⏳ Run `npm start`
5. ⏳ Test all features
6. ⏳ Deploy to production

**Estimated Time**: 15-20 minutes

---

**Last Updated**: 2024  
**Version**: 1.0
