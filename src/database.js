const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config');

class Database {
  constructor() {
    this.db = new sqlite3.Database(config.DB_PATH, (err) => {
      if (err) {
        console.error('Ошибка подключения к БД:', err);
      } else {
        console.log('Подключено к SQLite базе данных');
        this.initTables();
      }
    });
  }

  initTables() {
    // Таблица пользователей
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        is_active BOOLEAN DEFAULT 0,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица запросов на доступ
    this.db.run(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected
        admin_id INTEGER,
        decision_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Таблица посылок
    this.db.run(`
      CREATE TABLE IF NOT EXISTS parcels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_number TEXT UNIQUE NOT NULL,
        description TEXT,
        supplier TEXT,
        status TEXT DEFAULT 'ordered', -- ordered, shipped, in_transit, arrived, received
        user_id INTEGER NOT NULL,
        expected_date DATE,
        actual_date DATE,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Таблица склада
    this.db.run(`
      CREATE TABLE IF NOT EXISTS warehouse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 10,
        location TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Таблицы инициализированы');
  }

  // Общие методы для работы с БД
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = new Database();