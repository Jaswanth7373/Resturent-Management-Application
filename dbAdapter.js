// Database Adapter: Provides unified interface for lowdb (local) and Supabase (cloud)
// Use environment variable USE_SUPABASE=true to switch between databases

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

let db;

if (USE_SUPABASE) {
  // Use Supabase adapter
  const { supabase } = require('./supabase');
  
  db = {
    // Generic read method
    async get(table) {
      return {
        value: () => this.selectAll(table),
        size: () => ({ value: () => this.count(table) }),
        select: (fields) => ({
          where: (condition) => this.query(table, fields, condition),
          value: () => this.selectAll(table, fields)
        })
      };
    },

    // Get all records from a table
    async selectAll(table, fields = '*') {
      try {
        const { data, error } = await supabase
          .from(table)
          .select(fields || '*');
        
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error(`Error reading ${table}:`, err);
        return [];
      }
    },

    // Insert record
    async insert(table, record) {
      try {
        const { data, error } = await supabase
          .from(table)
          .insert([record])
          .select();
        
        if (error) throw error;
        return data?.[0] || record;
      } catch (err) {
        console.error(`Error inserting into ${table}:`, err);
        return null;
      }
    },

    // Update record
    async update(table, id, updates) {
      try {
        const { data, error } = await supabase
          .from(table)
          .update(updates)
          .eq('id', id)
          .select();
        
        if (error) throw error;
        return data?.[0] || updates;
      } catch (err) {
        console.error(`Error updating ${table}:`, err);
        return null;
      }
    },

    // Delete record
    async delete(table, id) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        console.error(`Error deleting from ${table}:`, err);
        return false;
      }
    },

    // Query with conditions
    async query(table, fields, condition) {
      try {
        let query = supabase.from(table).select(fields || '*');
        
        // Apply conditions (simple equality for now)
        if (condition) {
          for (const [key, value] of Object.entries(condition)) {
            query = query.eq(key, value);
          }
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error(`Error querying ${table}:`, err);
        return [];
      }
    },

    // Count records
    async count(table) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        return count || 0;
      } catch (err) {
        console.error(`Error counting ${table}:`, err);
        return 0;
      }
    },

    // Batch insert
    async insertMany(table, records) {
      try {
        const { data, error } = await supabase
          .from(table)
          .insert(records)
          .select();
        
        if (error) throw error;
        return data || records;
      } catch (err) {
        console.error(`Error batch inserting into ${table}:`, err);
        return [];
      }
    }
  };

} else {
  // Use lowdb adapter (local file-based)
  const low = require('lowdb');
  const FileSync = require('lowdb/adapters/FileSync');
  const path = require('path');

  const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
  const dbInstance = low(adapter);

  db = {
    get: (table) => ({
      value: () => dbInstance.get(table).value(),
      size: () => ({ value: () => dbInstance.get(table).size().value() }),
      push: (record) => dbInstance.get(table).push(record),
      find: (predicate) => ({ value: () => dbInstance.get(table).find(predicate).value() }),
      filter: (predicate) => ({ value: () => dbInstance.get(table).filter(predicate).value() }),
    }),
    write: () => dbInstance.write(),
    defaults: (defaults) => dbInstance.defaults(defaults),
  };
}

module.exports = { db, USE_SUPABASE };
