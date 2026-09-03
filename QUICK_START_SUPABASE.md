# ⚡ Quick Start: Supabase Integration

## 🎯 Your Goal
Get the Restaurant Platform running with Supabase in **5 minutes**.

---

## ✅ Status Check
- ✅ Supabase client installed
- ✅ Configuration files created
- ✅ Environment variables configured
- ✅ Server updated for Supabase
- ✅ You have Supabase credentials

---

## 🚀 5-Step Quick Start

### STEP 1: Create Database Schema (3 minutes)
1. Open: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** (left menu)
4. Click **New Query**
5. Open file: `SUPABASE_SCHEMA.sql` (in project root)
6. Copy ALL the SQL code
7. Paste into the SQL Editor box
8. Click **Run** button
9. ✅ Wait for "Query executed successfully"

### STEP 2: Verify Tables Created (1 minute)
1. In Supabase Dashboard, click **Database** → **Tables**
2. Scroll down and verify you see these tables:
   - users
   - restaurants
   - branches
   - tables
   - menu_items
   - orders
   - ... (and 14 more)
3. ✅ If all tables exist, move to next step

### STEP 3: Start the Server (30 seconds)
```bash
# Open terminal in project folder
cd c:\Users\jaswa\Downloads\restaurant-platform-final_9\project

# Start server
npm start
```

**Expected Output:**
```
✅ Supabase connected successfully
🍽  Restaurant platform running at http://localhost:3000
📊 Database: Supabase (Cloud PostgreSQL)
```

### STEP 4: Login & Test (1 minute)
1. Open browser: http://localhost:3000
2. Login with:
   - Email: `customer@demo.com`
   - Password: `password`
3. ✅ You're in!

### STEP 5: Test a Feature (30 seconds)
1. Click on a menu item (e.g., "Chicken 65")
2. Click "Add to Cart"
3. Click "Place Order"
4. ✅ Order placed! Check it appears on screen

---

## 📊 Verify Everything Works

### If login works: ✅
- Supabase is connected
- Tables exist
- Data is being read

### If orders show up: ✅
- Database writes are working
- Real-time updates working
- Backend routes working

### If you can change role and login: ✅
- User authentication working
- Role-based access working
- Everything is perfect!

---

## 🧑‍💼 All Test Accounts (Use any of these)

```
Email: customer@demo.com    | Password: password | Role: Customer
Email: waiter@demo.com      | Password: password | Role: Waiter
Email: chef@demo.com        | Password: password | Role: Chef
Email: inventory@demo.com   | Password: password | Role: Inventory Manager
Email: admin@demo.com       | Password: password | Role: Admin
```

---

## ⚠️ If Something Goes Wrong

### Server won't start?
```bash
# Kill any process using port 3000
netstat -ano | findstr :3000
# Then use Stop-Process to kill it
```

### "Cannot connect to Supabase"?
1. Check `.env` file has correct URL and key
2. Verify internet connection
3. Try: https://ngegwyvmxtmcfcazsnoe.supabase.co in browser

### Tables don't exist?
1. Go back to Step 1
2. Make sure you ran the SQL query
3. Check if it says "Query executed successfully"

### Login fails?
1. Restart server
2. Check browser console for errors (F12)
3. Try different test account

---

## 📚 Full Documentation

For detailed information, see:
- `SUPABASE_SETUP.md` - Complete setup guide
- `SUPABASE_INTEGRATION_COMPLETE.md` - Everything that was done
- `SUPABASE_SCHEMA.sql` - Database schema reference

---

## 🎯 What's In This Setup?

### Demo Restaurant: "The Copper Fork"
- 1 Branch (MG Road)
- 6 Tables (2-8 seats)
- 8 Menu Items (Starters, Mains, Desserts, Drinks)
- 5 Menu Categories
- 2 Active Coupons
- 3 Demo Suppliers

### Fully Functional Features:
- ✅ Customer ordering
- ✅ Waiter management
- ✅ Chef KDS
- ✅ Inventory tracking
- ✅ Order history
- ✅ Real-time updates
- ✅ Reservations
- ✅ Payment processing
- ✅ Role-based access

---

## 🎉 You're Done!

Your Restaurant Platform is now running on Supabase! 

**Time taken**: ~10-15 minutes  
**Database**: ✅ PostgreSQL (Cloud)  
**Status**: ✅ Ready to use  

---

Need more help? Check the full documentation files or refer back to Supabase official docs.

Good luck! 🍽️
