require('dotenv').config();

const config = {
  // Бот
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: parseInt(process.env.ADMIN_ID) || 0,
  
  // MySQL - все через chmb
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'chmb',
    user: process.env.DB_USER || 'chmb',
    password: process.env.DB_PASSWORD || 'chmb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
};

module.exports = config;