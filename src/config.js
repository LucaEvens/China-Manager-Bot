require('dotenv').config();

module.exports = {
  // Настройки бота
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  
  // Настройки базы данных
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'chmb',          // Обновлено
    password: process.env.DB_PASSWORD || 'chmb',  // Обновлено
    database: process.env.DB_NAME || 'chmb'       // Обновлено
  },
  
  // ID администратора
  ADMIN_ID: parseInt(process.env.ADMIN_USER_ID || '0'),
  
  // Настройки сервера
  PORT: parseInt(process.env.PORT || '3000'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Настройки логирования
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Настройки уведомлений
  NOTIFICATIONS: {
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
    check_interval: parseInt(process.env.NOTIFICATIONS_CHECK_INTERVAL || '3600000'),
    low_stock_threshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '10'),
    parcel_check_days: parseInt(process.env.PARCEL_CHECK_DAYS || '7')
  },
  
  // Настройки времени
  TIMEZONE: process.env.TIMEZONE || 'Europe/Moscow',
  
  // Настройки безопасности
  SECURITY: {
    max_login_attempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    session_timeout: parseInt(process.env.SESSION_TIMEOUT || '3600000')
  },
  
  // Проверка конфигурации
  validate: function() {
    const errors = [];
    
    if (!this.BOT_TOKEN) {
      errors.push('BOT_TOKEN не указан в .env файле');
    }
    
    if (!this.DB.host || !this.DB.user || !this.DB.database) {
      errors.push('Не все настройки базы данных указаны в .env файле');
    }
    
    if (errors.length > 0) {
      console.error('❌ Ошибки конфигурации:');
      errors.forEach(error => console.error(`   - ${error}`));
      console.error('\nПожалуйста, создайте .env файл на основе .env.example');
      process.exit(1);
    }
    
    console.log('✅ Конфигурация загружена успешно');
    console.log(`📊 Настройки БД: ${this.DB.user}@${this.DB.host}:${this.DB.port}/${this.DB.database}`);
    return true;
  }
};