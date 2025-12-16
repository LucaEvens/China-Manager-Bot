const database = require('../database/connection');
const keyboards = require('../keyboards');

function authHandlers(bot) {
  
  // Запрос доступа
  bot.onText(/\/request_access/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      // Проверяем, есть ли пользователь уже в базе
      const existingUser = await database.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [msg.from.id]
      );
      
      if (existingUser) {
        if (existingUser.is_active) {
          await bot.sendMessage(chatId, 
            '✅ Вы уже имеете доступ к боту!',
            keyboards.mainMenu()
          );
        } else {
          await bot.sendMessage(chatId, 
            '⏳ Ваш запрос на доступ уже находится на рассмотрении у администратора.',
            keyboards.backToStart()
          );
        }
        return;
      }
      
      // Создаем нового пользователя
      await database.insert('users', {
        telegram_id: msg.from.id,
        username: msg.from.username || null,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name || null,
        is_active: false,
        is_admin: false,
        created_at: new Date()
      });
      
      // Получаем ID созданного пользователя
      const newUser = await database.get(
        'SELECT id FROM users WHERE telegram_id = ?',
        [msg.from.id]
      );
      
      // Создаем запрос на доступ
      await database.insert('access_requests', {
        user_id: newUser.id,
        status: 'pending',
        created_at: new Date()
      });
      
      // Уведомляем администраторов
      const admins = await database.query(
        'SELECT telegram_id FROM users WHERE is_admin = TRUE'
      );
      
      const userInfo = `
👤 <b>Новый запрос на доступ</b>

ID: ${newUser.id}
Имя: ${msg.from.first_name}
Фамилия: ${msg.from.last_name || 'Не указана'}
Username: @${msg.from.username || 'Не указан'}
Telegram ID: ${msg.from.id}
      `;
      
      for (const admin of admins) {
        try {
          await bot.sendMessage(admin.telegram_id, userInfo, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Одобрить', callback_data: `approve_access:${newUser.id}` },
                  { text: '❌ Отклонить', callback_data: `reject_access:${newUser.id}` }
                ]
              ]
            }
          });
        } catch (error) {
          console.error('Ошибка при отправке уведомления админу:', error);
        }
      }
      
      await bot.sendMessage(chatId, 
        '✅ Ваш запрос на доступ отправлен администратору!\n' +
        'Мы уведомим вас, как только доступ будет предоставлен.',
        keyboards.backToStart()
      );
      
    } catch (error) {
      console.error('Ошибка при запросе доступа:', error);
      await bot.sendMessage(chatId, 
        '❌ Произошла ошибка при отправке запроса.',
        keyboards.backToStart()
      );
    }
  });
  
  // Обработка callback-запросов для доступа
  bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    
    if (!data.startsWith('approve_access:') && !data.startsWith('reject_access:')) {
      return;
    }
    
    const chatId = callbackQuery.message.chat.id;
    const [action, userId] = data.split(':');
    const isApproval = action === 'approve_access';
    
    try {
      // Проверяем права администратора
      const admin = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [callbackQuery.from.id]
      );
      
      if (!admin) {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Только администраторы могут выполнять это действие.' 
        });
        return;
      }
      
      // Обновляем статус запроса
      await database.update('access_requests',
        { user_id: userId },
        {
          status: isApproval ? 'approved' : 'rejected',
          admin_id: admin.id,
          decision_date: new Date()
        }
      );
      
      if (isApproval) {
        // Активируем пользователя
        await database.update('users',
          { id: userId },
          {
            is_active: true,
            updated_at: new Date()
          }
        );
        
        // Получаем данные пользователя для уведомления
        const user = await database.get('SELECT * FROM users WHERE id = ?', [userId]);
        
        if (user && user.telegram_id) {
          try {
            await bot.sendMessage(user.telegram_id,
              '🎉 <b>Ваш запрос на доступ одобрен!</b>\n\n' +
              'Теперь вы можете использовать все функции бота.\n' +
              'Используйте /menu для начала работы.',
              {
                parse_mode: 'HTML',
                reply_markup: keyboards.mainMenu()
              }
            );
          } catch (error) {
            console.error('Ошибка при отправке уведомления пользователю:', error);
          }
        }
        
        await bot.editMessageText(
          `✅ Запрос пользователя одобрен!\n\n` +
          `Пользователь ${user.first_name} теперь имеет доступ к боту.`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Доступ предоставлен!' });
        
      } else {
        // Отклоняем запрос
        const user = await database.get('SELECT * FROM users WHERE id = ?', [userId]);
        
        if (user && user.telegram_id) {
          try {
            await bot.sendMessage(user.telegram_id,
              '❌ <b>Ваш запрос на доступ отклонен</b>\n\n' +
              'Администратор отклонил ваш запрос на доступ к боту.\n' +
              'Если вы считаете, что это ошибка, свяжитесь с администратором.',
              {
                parse_mode: 'HTML',
                reply_markup: keyboards.backToStart()
              }
            );
          } catch (error) {
            console.error('Ошибка при отправке уведомления пользователю:', error);
          }
        }
        
        await bot.editMessageText(
          `❌ Запрос пользователя отклонен.\n\n` +
          `Пользователь ${user.first_name} не получил доступ к боту.`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Доступ отклонен!' });
      }
      
    } catch (error) {
      console.error('Ошибка при обработке запроса доступа:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
  
  // Выход из системы
  bot.onText(/\/logout/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      await bot.sendMessage(chatId,
        '👋 Вы вышли из системы.\n\n' +
        'Для повторного входа используйте /start',
        {
          reply_markup: {
            remove_keyboard: true
          }
        }
      );
      
    } catch (error) {
      console.error('Ошибка при выходе:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при выходе.');
    }
  });
}

module.exports = authHandlers;