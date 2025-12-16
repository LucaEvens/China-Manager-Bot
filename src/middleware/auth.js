const database = require('../database/connection');

module.exports = {
  // Проверка аутентификации пользователя для сообщений
  requireAuth: async (msg, bot) => {
    try {
      // Пропускаем команды start, help и request_access без проверки
      if (msg.text && (
        msg.text.startsWith('/start') || 
        msg.text.startsWith('/help') || 
        msg.text.startsWith('/about') ||
        msg.text.startsWith('/request_access')
      )) {
        return true;
      }
      
      // Проверяем наличие пользователя в базе
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [msg.from.id]
      );
      
      if (!user) {
        // Если пользователя нет, предлагаем запросить доступ
        if (msg.chat && msg.chat.id) {
          await bot.sendMessage(msg.chat.id,
            '🔐 Для использования бота необходимо получить доступ.\n\n' +
            'Используйте команду /request_access для отправки запроса администратору.',
            {
              reply_markup: {
                keyboard: [['/request_access', '/start']],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
        }
        return false; // Не продолжаем обработку
      }
      
      if (!user.is_active) {
        // Если пользователь не активен
        if (msg.chat && msg.chat.id) {
          await bot.sendMessage(msg.chat.id,
            '⏳ Ваш аккаунт ожидает подтверждения администратора.\n' +
            'Мы уведомим вас, когда доступ будет предоставлен.',
            {
              reply_markup: {
                keyboard: [['/start']],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
        }
        return false; // Не продолжаем обработку
      }
      
      // Добавляем информацию о пользователе в сообщение
      msg.user = user;
      
      // Продолжаем обработку
      return true;
      
    } catch (error) {
      console.error('Ошибка в middleware аутентификации:', error);
      
      if (msg.chat && msg.chat.id) {
        await bot.sendMessage(msg.chat.id,
          '❌ Произошла ошибка при проверке доступа.\n' +
          'Пожалуйста, попробуйте позже или обратитесь к администратору.'
        );
      }
      return false;
    }
  },

  // Проверка прав администратора для сообщений
  requireAdmin: async (msg, bot) => {
    try {
      // Сначала проверяем аутентификацию
      const authResult = await module.exports.requireAuth(msg, bot);
      if (!authResult) {
        return false;
      }
      
      // Проверяем права администратора
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [msg.from.id]
      );
      
      if (!user) {
        if (msg.chat && msg.chat.id) {
          await bot.sendMessage(msg.chat.id, '❌ Эта команда доступна только администраторам.');
        }
        return false;
      }
      
      // Добавляем информацию о пользователе в сообщение
      msg.user = user;
      
      // Продолжаем обработку
      return true;
      
    } catch (error) {
      console.error('Ошибка в middleware проверки админа:', error);
      
      if (msg.chat && msg.chat.id) {
        await bot.sendMessage(msg.chat.id,
          '❌ Произошла ошибка при проверке прав доступа.'
        );
      }
      return false;
    }
  },

  // Проверка для callback запросов
  requireAuthCallback: async (callbackQuery, bot) => {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [callbackQuery.from.id]
      );
      
      if (!user || !user.is_active) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Доступ запрещен. Требуется аутентификация.',
          show_alert: true
        });
        return false;
      }
      
      // Добавляем информацию о пользователе в callback
      callbackQuery.user = user;
      
      // Продолжаем обработку
      return true;
      
    } catch (error) {
      console.error('Ошибка в middleware аутентификации для callback:', error);
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Произошла ошибка при проверке доступа.',
        show_alert: true
      });
      return false;
    }
  },

  // Проверка админа для callback запросов
  requireAdminCallback: async (callbackQuery, bot) => {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [callbackQuery.from.id]
      );
      
      if (!user) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Эта функция доступна только администраторам.',
          show_alert: true
        });
        return false;
      }
      
      // Добавляем информацию о пользователе в callback
      callbackQuery.user = user;
      
      // Продолжаем обработку
      return true;
      
    } catch (error) {
      console.error('Ошибка в middleware проверки админа для callback:', error);
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Произошла ошибка при проверке прав доступа.',
        show_alert: true
      });
      return false;
    }
  }
};