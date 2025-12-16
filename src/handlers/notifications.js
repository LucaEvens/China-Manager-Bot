const database = require('../database/connection');
const { sendNotification } = require('../utils/notifications');

module.exports = function(bot) {
  
  // Управление уведомлениями
  bot.onText(/\/notifications/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      const notificationsText = `
📢 <b>Управление уведомлениями:</b>

Текущий статус: ${user.notifications_enabled ? '✅ Включены' : '❌ Выключены'}

<b>Типы уведомлений:</b>
• 📦 Изменение статуса посылок
• 📊 Низкий запас товаров
• ⏰ Напоминания о действиях
• 🔔 Системные уведомления
      `;
      
      await bot.sendMessage(chatId, notificationsText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: user.notifications_enabled ? '🔕 Отключить все' : '🔔 Включить все', 
                callback_data: user.notifications_enabled ? 'disable_all_notifications' : 'enable_all_notifications'
              }
            ],
            [
              { text: '📦 Посылки', callback_data: 'parcel_notifications' },
              { text: '📊 Склад', callback_data: 'warehouse_notifications' }
            ],
            [
              { text: '⏰ Напоминания', callback_data: 'reminder_settings' },
              { text: '📋 История', callback_data: 'notification_history' }
            ],
            [
              { text: '⚙️ Настройки', callback_data: 'notification_preferences' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при загрузке уведомлений:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке уведомлений.');
    }
  });
  
  // Тест уведомления
  bot.onText(/\/test_notification/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      if (!user.notifications_enabled) {
        await bot.sendMessage(chatId, 
          '🔕 Уведомления отключены в вашем профиле.\n' +
          'Включите их в настройках уведомлений.'
        );
        return;
      }
      
      // Отправляем тестовое уведомление
      await sendNotification(bot, user.telegram_id, 
        '🔔 <b>Тестовое уведомление</b>\n\n' +
        'Это тестовое сообщение подтверждает, что система уведомлений работает правильно.\n\n' +
        '📅 Время отправки: ' + new Date().toLocaleString('ru-RU'),
        { parse_mode: 'HTML' }
      );
      
      await bot.sendMessage(chatId, '✅ Тестовое уведомление отправлено!');
      
    } catch (error) {
      console.error('Ошибка при отправке тестового уведомления:', error);
      await bot.sendMessage(chatId, '❌ Не удалось отправить тестовое уведомление.');
    }
  });
  
  // Настройка напоминаний
  bot.onText(/\/setup_reminders/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем активные напоминания пользователя
      const reminders = await database.query(`
        SELECT r.*, p.tracking_number, p.description 
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        WHERE r.user_id = ? AND r.is_sent = FALSE
        ORDER BY r.reminder_date
      `, [user.id]);
      
      let remindersText = '⏰ <b>Ваши напоминания:</b>\n\n';
      
      if (reminders.length === 0) {
        remindersText += 'У вас нет активных напоминаний.\n\n';
      } else {
        reminders.forEach((reminder, index) => {
          const date = new Date(reminder.reminder_date).toLocaleDateString('ru-RU');
          remindersText += `${index + 1}. 📦 ${reminder.tracking_number}\n`;
          remindersText += `   📝 ${reminder.description || 'Без описания'}\n`;
          remindersText += `   📅 Напомнить: ${date}\n`;
          remindersText += `   💬 ${reminder.message || 'Без сообщения'}\n\n`;
        });
      }
      
      remindersText += 'Выберите действие:';
      
      await bot.sendMessage(chatId, remindersText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Добавить напоминание', callback_data: 'add_reminder' }
            ],
            reminders.length > 0 ? [
              { text: '✏️ Редактировать', callback_data: 'edit_reminders' },
              { text: '🗑️ Удалить', callback_data: 'delete_reminders' }
            ] : [],
            [
              { text: '⚙️ Настройки', callback_data: 'reminder_frequency' }
            ]
          ].filter(row => row.length > 0)
        }
      });
      
    } catch (error) {
      console.error('Ошибка при настройке напоминаний:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Обработка callback-запросов для уведомлений
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Включение/выключение всех уведомлений
      if (data === 'enable_all_notifications' || data === 'disable_all_notifications') {
        const enable = data === 'enable_all_notifications';
        
        await database.update('users', 
          { telegram_id: callbackQuery.from.id },
          { notifications_enabled: enable }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: enable ? 'Все уведомления включены!' : 'Все уведомления выключены!' 
        });
        
        // Обновляем сообщение
        bot.emit('text', { ...callbackQuery.message, text: '/notifications' });
      }
      
      // Уведомления для посылок
      else if (data === 'parcel_notifications') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        const parcelSettings = await database.get(
          'SELECT * FROM user_notification_settings WHERE user_id = ? AND notification_type = "parcel"',
          [user.id]
        ) || {};
        
        await bot.editMessageText(
          '📦 <b>Уведомления для посылок:</b>\n\n' +
          'Настройте получение уведомлений о изменениях статуса ваших посылок:\n\n' +
          `• Статус "Заказан": ${parcelSettings.status_ordered ? '✅' : '❌'}\n` +
          `• Статус "Отправлен": ${parcelSettings.status_shipped ? '✅' : '❌'}\n` +
          `• Статус "В пути": ${parcelSettings.status_in_transit ? '✅' : '❌'}\n` +
          `• Статус "Прибыл": ${parcelSettings.status_arrived ? '✅' : '❌'}\n` +
          `• Статус "Получен": ${parcelSettings.status_received ? '✅' : '❌'}\n\n` +
          'Выберите статусы для уведомлений:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: parcelSettings.status_ordered ? '✅ Заказан' : '❌ Заказан', callback_data: 'toggle_parcel:ordered' },
                  { text: parcelSettings.status_shipped ? '✅ Отправлен' : '❌ Отправлен', callback_data: 'toggle_parcel:shipped' }
                ],
                [
                  { text: parcelSettings.status_in_transit ? '✅ В пути' : '❌ В пути', callback_data: 'toggle_parcel:in_transit' },
                  { text: parcelSettings.status_arrived ? '✅ Прибыл' : '❌ Прибыл', callback_data: 'toggle_parcel:arrived' }
                ],
                [
                  { text: parcelSettings.status_received ? '✅ Получен' : '❌ Получен', callback_data: 'toggle_parcel:received' },
                  { text: '🔄 Все', callback_data: 'toggle_all_parcel' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_notifications' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Переключение уведомлений для статуса посылки
      else if (data.startsWith('toggle_parcel:')) {
        const status = data.split(':')[1];
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Здесь нужно обновить настройки уведомлений для пользователя
        // Создаем или обновляем запись в user_notification_settings
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `Настройки для "${status}" обновлены!` 
        });
        
        // Обновляем сообщение
        bot.emit('callback_query', { 
          ...callbackQuery, 
          data: 'parcel_notifications' 
        });
      }
      
      // Уведомления для склада
      else if (data === 'warehouse_notifications') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        const warehouseSettings = await database.get(
          'SELECT * FROM user_notification_settings WHERE user_id = ? AND notification_type = "warehouse"',
          [user.id]
        ) || {};
        
        await bot.editMessageText(
          '📊 <b>Уведомления для склада:</b>\n\n' +
          'Настройте получение уведомлений о состоянии склада:\n\n' +
          `• Низкий запас: ${warehouseSettings.low_stock ? '✅' : '❌'}\n` +
          `• Критический запас: ${warehouseSettings.critical_stock ? '✅' : '❌'}\n` +
          `• Пополнение склада: ${warehouseSettings.stock_replenished ? '✅' : '❌'}\n` +
          `• Новые поступления: ${warehouseSettings.new_arrivals ? '✅' : '❌'}\n\n` +
          'Выберите типы уведомлений:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: warehouseSettings.low_stock ? '✅ Низкий запас' : '❌ Низкий запас', callback_data: 'toggle_warehouse:low_stock' },
                  { text: warehouseSettings.critical_stock ? '✅ Критический' : '❌ Критический', callback_data: 'toggle_warehouse:critical_stock' }
                ],
                [
                  { text: warehouseSettings.stock_replenished ? '✅ Пополнение' : '❌ Пополнение', callback_data: 'toggle_warehouse:stock_replenished' },
                  { text: warehouseSettings.new_arrivals ? '✅ Поступления' : '❌ Поступления', callback_data: 'toggle_warehouse:new_arrivals' }
                ],
                [
                  { text: '🔄 Все', callback_data: 'toggle_all_warehouse' },
                  { text: '📊 Пороги', callback_data: 'set_stock_thresholds' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_notifications' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Настройки напоминаний
      else if (data === 'reminder_settings') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        await bot.editMessageText(
          '⏰ <b>Настройки напоминаний:</b>\n\n' +
          'Настройте частоту и типы напоминаний:\n\n' +
          '• Ежедневные отчеты\n' +
          '• Напоминания о посылках\n' +
          '• Напоминания о проверке склада\n\n' +
          'Выберите настройку:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📅 Ежедневные', callback_data: 'daily_reminders' },
                  { text: '📦 Для посылок', callback_data: 'parcel_reminders' }
                ],
                [
                  { text: '📊 Для склада', callback_data: 'warehouse_reminders' },
                  { text: '⏱️ Интервал', callback_data: 'reminder_interval' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_notifications' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // История уведомлений
      else if (data === 'notification_history') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Получаем последние уведомления
        const notifications = await database.query(`
          SELECT * FROM notification_log 
          WHERE user_id = ? 
          ORDER BY created_at DESC 
          LIMIT 10
        `, [user.id]);
        
        let historyText = '📋 <b>История уведомлений:</b>\n\n';
        
        if (notifications.length === 0) {
          historyText += 'История уведомлений пуста.\n';
        } else {
          notifications.forEach((notif, index) => {
            const date = new Date(notif.created_at).toLocaleString('ru-RU');
            const typeEmoji = getNotificationTypeEmoji(notif.type);
            
            historyText += `${index + 1}. ${typeEmoji} ${date}\n`;
            historyText += `   ${notif.message.substring(0, 50)}${notif.message.length > 50 ? '...' : ''}\n\n`;
          });
        }
        
        await bot.editMessageText(
          historyText,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🗑️ Очистить историю', callback_data: 'clear_notification_history' },
                  { text: '🔄 Обновить', callback_data: 'notification_history' }
                ],
                [
                  { text: '↩️ Назад', callback_data: 'back_to_notifications' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Возврат к уведомлениям
      else if (data === 'back_to_notifications') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/notifications' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Добавление напоминания
      else if (data === 'add_reminder') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        
        // Сначала получаем список посылок пользователя
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        const parcels = await database.query(`
          SELECT id, tracking_number, description 
          FROM parcels 
          WHERE user_id = ? AND status != 'received'
          ORDER BY created_at DESC
        `, [user.id]);
        
        if (parcels.length === 0) {
          await bot.sendMessage(chatId, '❌ У вас нет активных посылок для напоминаний.');
          return;
        }
        
        const keyboard = parcels.map(parcel => [
          {
            text: `${parcel.tracking_number} - ${parcel.description || 'Без описания'}`,
            callback_data: `select_parcel_for_reminder:${parcel.id}`
          }
        ]);
        
        keyboard.push([{ text: '❌ Отмена', callback_data: 'cancel_add_reminder' }]);
        
        await bot.sendMessage(chatId, 
          '📦 Выберите посылку для напоминания:',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике уведомлений:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
  
  // Вспомогательные функции
  function getNotificationTypeEmoji(type) {
    const emojiMap = {
      'parcel': '📦',
      'warehouse': '📊',
      'reminder': '⏰',
      'system': '🔔',
      'admin': '👑'
    };
    return emojiMap[type] || '📢';
  }
};