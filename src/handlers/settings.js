const database = require('../database/connection');

function settingsHandlers(bot) {
  
  // Настройки пользователя
  bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      const settingsText = `
⚙️ <b>Ваши настройки:</b>

👤 <b>Профиль:</b>
   Имя: ${user.first_name}
   Фамилия: ${user.last_name || 'Не указана'}
   Username: @${user.username || 'Не указан'}
   
🔔 <b>Уведомления:</b>
   Статус: ${user.notifications_enabled ? '✅ Включены' : '❌ Выключены'}
   
📅 <b>Часовой пояс:</b>
   ${user.timezone || 'Не установлен'}
   
💬 <b>Язык:</b>
   ${user.language || 'Русский'}
      `;
      
      await bot.sendMessage(chatId, settingsText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👤 Редактировать профиль', callback_data: 'edit_profile' },
              { text: '🔔 Уведомления', callback_data: 'notification_settings' }
            ],
            [
              { text: '🌐 Язык и время', callback_data: 'language_time_settings' },
              { text: '🔐 Безопасность', callback_data: 'security_settings' }
            ],
            [
              { text: '📊 Статистика', callback_data: 'user_stats' },
              { text: '🔄 Сбросить настройки', callback_data: 'reset_settings' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при загрузке настроек:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке настроек.');
    }
  });
  
  // Редактирование профиля
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Редактирование профиля
      if (data === 'edit_profile') {
        await bot.editMessageText(
          '👤 <b>Редактирование профиля:</b>\n\n' +
          'Выберите, что хотите изменить:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✏️ Изменить имя', callback_data: 'edit_first_name' },
                  { text: '✏️ Изменить фамилию', callback_data: 'edit_last_name' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_settings' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Изменение имени
      else if (data === 'edit_first_name') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        
        await bot.sendMessage(chatId, 
          '✏️ Введите ваше новое имя:',
          {
            reply_markup: {
              force_reply: true,
              selective: true
            }
          }
        ).then(sentMsg => {
          bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
            const newFirstName = replyMsg.text.trim();
            
            if (!newFirstName) {
              await bot.sendMessage(chatId, '❌ Имя не может быть пустым.');
              return;
            }
            
            await database.update('users', 
              { telegram_id: replyMsg.from.id },
              { first_name: newFirstName }
            );
            
            await bot.sendMessage(chatId, `✅ Имя успешно изменено на: ${newFirstName}`);
          });
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Изменение фамилии
      else if (data === 'edit_last_name') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        
        await bot.sendMessage(chatId, 
          '✏️ Введите вашу новую фамилию (или оставьте пустым, чтобы удалить):',
          {
            reply_markup: {
              force_reply: true,
              selective: true
            }
          }
        ).then(sentMsg => {
          bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
            const newLastName = replyMsg.text.trim();
            
            await database.update('users', 
              { telegram_id: replyMsg.from.id },
              { last_name: newLastName || null }
            );
            
            if (newLastName) {
              await bot.sendMessage(chatId, `✅ Фамилия успешно изменена на: ${newLastName}`);
            } else {
              await bot.sendMessage(chatId, '✅ Фамилия удалена из профиля.');
            }
          });
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Настройки уведомлений
      else if (data === 'notification_settings') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        await bot.editMessageText(
          '🔔 <b>Настройки уведомлений:</b>\n\n' +
          `Текущий статус: ${user.notifications_enabled ? '✅ Включены' : '❌ Выключены'}\n\n` +
          'Вы можете настроить получение уведомлений о:\n' +
          '• Изменении статуса посылок\n' +
          '• Низком запасе товаров\n' +
          '• Напоминаниях о действиях',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { 
                    text: user.notifications_enabled ? '🔕 Выключить уведомления' : '🔔 Включить уведомления', 
                    callback_data: user.notifications_enabled ? 'disable_notifications' : 'enable_notifications'
                  }
                ],
                [
                  { text: '⏰ Настроить напоминания', callback_data: 'setup_reminders' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_settings' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Включение/выключение уведомлений
      else if (data === 'enable_notifications' || data === 'disable_notifications') {
        const enable = data === 'enable_notifications';
        
        await database.update('users', 
          { telegram_id: callbackQuery.from.id },
          { notifications_enabled: enable }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: enable ? 'Уведомления включены!' : 'Уведомления выключены!' 
        });
        
        // Обновляем сообщение
        bot.emit('callback_query', { 
          ...callbackQuery, 
          data: 'notification_settings' 
        });
      }
      
      // Настройки языка и времени
      else if (data === 'language_time_settings') {
        await bot.editMessageText(
          '🌐 <b>Настройки языка и времени:</b>\n\n' +
          'Выберите настройку для изменения:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🇷🇺 Русский', callback_data: 'set_language:ru' },
                  { text: '🇺🇸 English', callback_data: 'set_language:en' }
                ],
                [
                  { text: '🕐 Часовой пояс +3', callback_data: 'set_timezone:3' },
                  { text: '🕐 Часовой пояс +5', callback_data: 'set_timezone:5' },
                  { text: '🕐 Часовой пояс +7', callback_data: 'set_timezone:7' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_settings' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Установка языка
      else if (data.startsWith('set_language:')) {
        const language = data.split(':')[1];
        const languageText = language === 'ru' ? 'Русский' : 'English';
        
        await database.update('users', 
          { telegram_id: callbackQuery.from.id },
          { language: language }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `Язык изменен на: ${languageText}` 
        });
        
        // Обновляем сообщение
        bot.emit('callback_query', { 
          ...callbackQuery, 
          data: 'language_time_settings' 
        });
      }
      
      // Установка часового пояса
      else if (data.startsWith('set_timezone:')) {
        const timezone = data.split(':')[1];
        
        await database.update('users', 
          { telegram_id: callbackQuery.from.id },
          { timezone: timezone }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `Часовой пояс изменен на: GMT+${timezone}` 
        });
        
        // Обновляем сообщение
        bot.emit('callback_query', { 
          ...callbackQuery, 
          data: 'language_time_settings' 
        });
      }
      
      // Статистика пользователя
      else if (data === 'user_stats') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        const stats = await database.query(`
          SELECT 
            COUNT(p.id) as total_parcels,
            SUM(CASE WHEN p.status = 'received' THEN 1 ELSE 0 END) as received_parcels,
            COUNT(DISTINCT p.supplier) as unique_suppliers
          FROM parcels p
          WHERE p.user_id = ?
        `, [user.id]);
        
        const stat = stats[0] || {};
        
        await bot.editMessageText(
          `📊 <b>Ваша статистика:</b>\n\n` +
          `👤 <b>Профиль:</b>\n` +
          `   Регистрация: ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n` +
          `   Активность: ${new Date(user.updated_at).toLocaleDateString('ru-RU')}\n\n` +
          `📦 <b>Посылки:</b>\n` +
          `   Всего: ${stat.total_parcels || 0}\n` +
          `   Получено: ${stat.received_parcels || 0}\n` +
          `   Поставщиков: ${stat.unique_suppliers || 0}\n\n` +
          `📅 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '↩️ Назад', callback_data: 'back_to_settings' },
                  { text: '🔄 Обновить', callback_data: 'user_stats' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Возврат к настройкам
      else if (data === 'back_to_settings') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/settings' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Сброс настроек
      else if (data === 'reset_settings') {
        await bot.editMessageText(
          '⚠️ <b>Сброс настроек:</b>\n\n' +
          'Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?\n\n' +
          'Это действие нельзя отменить.',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Да, сбросить', callback_data: 'confirm_reset_settings' },
                  { text: '❌ Нет, отменить', callback_data: 'back_to_settings' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Подтверждение сброса настроек
      else if (data === 'confirm_reset_settings') {
        await database.update('users', 
          { telegram_id: callbackQuery.from.id },
          {
            notifications_enabled: true,
            timezone: null,
            language: null,
            updated_at: new Date()
          }
        );
        
        await bot.editMessageText(
          '✅ Все настройки сброшены к значениям по умолчанию!',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Настройки сброшены!' });
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике настроек:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
}

module.exports = settingsHandlers;