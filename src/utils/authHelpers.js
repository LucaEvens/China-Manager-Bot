const database = require('../database/connection');

module.exports = {
  // Проверка аутентификации пользователя
  checkAuth: async (telegramId) => {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [telegramId]
      );
      
      if (!user) {
        return { success: false, message: 'Пользователь не найден' };
      }
      
      if (!user.is_active) {
        return { success: false, message: 'Аккаунт не активирован' };
      }
      
      return { success: true, user };
    } catch (error) {
      console.error('Ошибка при проверке аутентификации:', error);
      return { success: false, message: 'Ошибка при проверке доступа' };
    }
  },
  
  // Проверка прав администратора
  checkAdmin: async (telegramId) => {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [telegramId]
      );
      
      if (!user) {
        return { success: false, message: 'Недостаточно прав' };
      }
      
      return { success: true, user };
    } catch (error) {
      console.error('Ошибка при проверке администратора:', error);
      return { success: false, message: 'Ошибка при проверке прав' };
    }
  },
  
  // Проверка аутентификации и отправка сообщения об ошибке
  checkAuthWithMessage: async (msg, bot) => {
    const result = await module.exports.checkAuth(msg.from.id);
    
    if (!result.success) {
      try {
        await bot.sendMessage(msg.chat.id, `❌ ${result.message}`);
      } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
      }
      return null;
    }
    
    return result.user;
  },
  
  // Проверка администратора и отправка сообщения об ошибке
  checkAdminWithMessage: async (msg, bot) => {
    const result = await module.exports.checkAdmin(msg.from.id);
    
    if (!result.success) {
      try {
        await bot.sendMessage(msg.chat.id, `❌ ${result.message}`);
      } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
      }
      return null;
    }
    
    return result.user;
  },
  
  // Проверка аутентификации для callback
  checkAuthCallback: async (callbackQuery, bot) => {
    const result = await module.exports.checkAuth(callbackQuery.from.id);
    
    if (!result.success) {
      try {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `❌ ${result.message}`,
          show_alert: true
        });
      } catch (error) {
        console.error('Ошибка при ответе на callback:', error);
      }
      return null;
    }
    
    return result.user;
  },
  
  // Проверка администратора для callback
  checkAdminCallback: async (callbackQuery, bot) => {
    const result = await module.exports.checkAdmin(callbackQuery.from.id);
    
    if (!result.success) {
      try {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `❌ ${result.message}`,
          show_alert: true
        });
      } catch (error) {
        console.error('Ошибка при ответе на callback:', error);
      }
      return null;
    }
    
    return result.user;
  }
};