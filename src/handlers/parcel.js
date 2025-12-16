const database = require('../database/connection');
const keyboards = require('../keyboards');

function parcelHandlers(bot) {
  
  // Мои посылки
  bot.onText(/\/parcels/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем посылки пользователя
      const parcels = await database.query(`
        SELECT * FROM parcels 
        WHERE user_id = ? 
        ORDER BY 
          CASE status
            WHEN 'ordered' THEN 1
            WHEN 'shipped' THEN 2
            WHEN 'in_transit' THEN 3
            WHEN 'arrived' THEN 4
            WHEN 'received' THEN 5
          END,
          created_at DESC
        LIMIT 10
      `, [user.id]);
      
      if (parcels.length === 0) {
        await bot.sendMessage(chatId, 
          '📭 У вас пока нет посылок.\n\n' +
          'Добавьте свою первую посылку с помощью команды /add_parcel',
          keyboards.mainMenu()
        );
        return;
      }
      
      let message = '📦 <b>Ваши посылки:</b>\n\n';
      
      parcels.forEach((parcel, index) => {
        const statusEmoji = getStatusEmoji(parcel.status);
        const statusText = getStatusText(parcel.status);
        const date = parcel.expected_date ? 
          `📅 Ожидается: ${new Date(parcel.expected_date).toLocaleDateString('ru-RU')}` : 
          '';
        
        message += `${index + 1}. ${statusEmoji} <b>${parcel.tracking_number}</b>\n`;
        message += `   ${parcel.description || 'Без описания'}\n`;
        message += `   🏷️ Статус: ${statusText}\n`;
        if (parcel.supplier) {
          message += `   🏪 Поставщик: ${parcel.supplier}\n`;
        }
        if (date) {
          message += `   ${date}\n`;
        }
        if (parcel.notes) {
          message += `   📝 Заметки: ${parcel.notes.substring(0, 30)}${parcel.notes.length > 30 ? '...' : ''}\n`;
        }
        message += '\n';
      });
      
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Добавить посылку', callback_data: 'add_parcel_btn' },
              { text: '🔄 Обновить', callback_data: 'refresh_parcels' }
            ],
            [
              { text: '📊 Статистика', callback_data: 'parcel_stats' },
              { text: '🔍 Поиск', callback_data: 'search_parcel' }
            ],
            [
              { text: '⏰ Напоминания', callback_data: 'parcel_reminders' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении посылок:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке посылок.');
    }
  });
  
  // Добавление посылки
  bot.onText(/\/add_parcel/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, 
      '📝 Для добавления посылки введите данные в формате:\n\n' +
      '<code>Трек-номер, Описание, Поставщик</code>\n\n' +
      'Пример:\n' +
      '<code>RU123456789CN, Смартфон Xiaomi, AliExpress</code>\n\n' +
      'Опционально можно добавить ожидаемую дату и заметки:\n' +
      '<code>Трек-номер, Описание, Поставщик, 2024-01-20, Важные заметки</code>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          force_reply: true,
          selective: true
        }
      }
    ).then(sentMsg => {
      // Сохраняем ID сообщения для обработки ответа
      bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
        try {
          const text = replyMsg.text.trim();
          const parts = text.split(',').map(s => s.trim());
          
          const trackingNumber = parts[0];
          const description = parts[1] || 'Без описания';
          const supplier = parts[2] || 'Не указан';
          const expectedDate = parts[3] ? new Date(parts[3]) : null;
          const notes = parts[4] || null;
          
          if (!trackingNumber) {
            await bot.sendMessage(chatId, '❌ Трек-номер обязателен.');
            return;
          }
          
          const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [replyMsg.from.id]);
          
          if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден.');
            return;
          }
          
          // Проверяем, существует ли уже посылка с таким трек-номером
          const existingParcel = await database.get(
            'SELECT * FROM parcels WHERE tracking_number = ?',
            [trackingNumber]
          );
          
          if (existingParcel) {
            await bot.sendMessage(chatId, 
              '❌ Посылка с таким трек-номером уже существует.\n' +
              'Используйте другой трек-номер.'
            );
            return;
          }
          
          // Добавляем посылку
          await database.insert('parcels', {
            tracking_number: trackingNumber,
            description: description,
            supplier: supplier,
            user_id: user.id,
            status: 'ordered',
            expected_date: expectedDate,
            notes: notes,
            created_at: new Date()
          });
          
          let responseMessage = `✅ Посылка добавлена!\n\n` +
            `📦 <b>Трек-номер:</b> ${trackingNumber}\n` +
            `📝 <b>Описание:</b> ${description}\n` +
            `🏪 <b>Поставщик:</b> ${supplier}\n` +
            `📊 <b>Статус:</b> Заказан`;
          
          if (expectedDate) {
            responseMessage += `\n📅 <b>Ожидается:</b> ${expectedDate.toLocaleDateString('ru-RU')}`;
          }
          if (notes) {
            responseMessage += `\n📝 <b>Заметки:</b> ${notes}`;
          }
          
          await bot.sendMessage(chatId, responseMessage, { parse_mode: 'HTML' });
          
        } catch (error) {
          console.error('Ошибка при добавлении посылки:', error);
          
          if (error.code === 'ER_DUP_ENTRY') {
            await bot.sendMessage(chatId, '❌ Посылка с таким трек-номером уже существует.');
          } else if (error.message.includes('date')) {
            await bot.sendMessage(chatId, '❌ Неверный формат даты. Используйте формат ГГГГ-ММ-ДД.');
          } else {
            await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении посылки.');
          }
        }
      });
    });
  });
  
  // Отслеживание посылки
  bot.onText(/\/track/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем последние посылки для отслеживания
      const parcels = await database.query(`
        SELECT tracking_number, description, status 
        FROM parcels 
        WHERE user_id = ? AND status != 'received'
        ORDER BY created_at DESC
        LIMIT 5
      `, [user.id]);
      
      if (parcels.length === 0) {
        await bot.sendMessage(chatId, 
          '❌ У вас нет активных посылок для отслеживания.\n' +
          'Добавьте посылку с помощью /add_parcel'
        );
        return;
      }
      
      const keyboard = parcels.map(parcel => [
        {
          text: `${parcel.tracking_number} - ${getStatusEmoji(parcel.status)}`,
          callback_data: `track_parcel:${parcel.tracking_number}`
        }
      ]);
      
      keyboard.push([
        { text: '🔍 Ввести трек-номер вручную', callback_data: 'track_manual' }
      ]);
      
      await bot.sendMessage(chatId, 
        '🔍 Выберите посылку для отслеживания:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
      
    } catch (error) {
      console.error('Ошибка при отслеживании:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Обновление статуса посылки
  bot.onText(/\/update_parcel/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем посылки пользователя
      const parcels = await database.query(`
        SELECT id, tracking_number, description, status 
        FROM parcels 
        WHERE user_id = ? AND status != 'received'
        ORDER BY created_at DESC
        LIMIT 10
      `, [user.id]);
      
      if (parcels.length === 0) {
        await bot.sendMessage(chatId, '❌ У вас нет активных посылок для обновления.');
        return;
      }
      
      const keyboard = parcels.map(parcel => [
        {
          text: `${parcel.tracking_number} - ${getStatusEmoji(parcel.status)}`,
          callback_data: `update_parcel_status:${parcel.id}`
        }
      ]);
      
      keyboard.push([{ text: '❌ Отмена', callback_data: 'cancel_update' }]);
      
      await bot.sendMessage(chatId, 
        '🔄 Выберите посылку для обновления статуса:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
      
    } catch (error) {
      console.error('Ошибка при обновлении посылки:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Обработка callback-запросов для посылок
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Добавление посылки через кнопку
      if (data === 'add_parcel_btn') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/add_parcel' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Обновление списка посылок
      else if (data === 'refresh_parcels') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновление...' });
        bot.emit('text', { ...callbackQuery.message, text: '/parcels' });
      }
      
      // Статистика посылок
      else if (data === 'parcel_stats') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        const stats = await database.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) as ordered,
            SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
            SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
            SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) as arrived,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
            AVG(DATEDIFF(COALESCE(actual_date, NOW()), created_at)) as avg_days
          FROM parcels 
          WHERE user_id = ?
        `, [user.id]);
        
        const stat = stats[0];
        const avgDays = stat.avg_days ? Math.round(stat.avg_days) : 0;
        
        await bot.editMessageText(
          `📊 <b>Статистика ваших посылок:</b>\n\n` +
          `📦 Всего посылок: ${stat.total}\n` +
          `🛒 Заказано: ${stat.ordered}\n` +
          `🚚 Отправлено: ${stat.shipped}\n` +
          `🚛 В пути: ${stat.in_transit}\n` +
          `🏠 Прибыло: ${stat.arrived}\n` +
          `✅ Получено: ${stat.received}\n\n` +
          `📈 Среднее время доставки: ${avgDays} дней\n\n` +
          `📅 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '↩️ Назад к посылкам', callback_data: 'refresh_parcels' },
                  { text: '🔄 Обновить', callback_data: 'parcel_stats' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Поиск посылки
      else if (data === 'search_parcel') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        
        await bot.sendMessage(chatId, 
          '🔍 Введите трек-номер или часть описания для поиска:',
          {
            reply_markup: {
              force_reply: true,
              selective: true
            }
          }
        ).then(sentMsg => {
          bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
            const searchTerm = `%${replyMsg.text.trim()}%`;
            const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [replyMsg.from.id]);
            
            const results = await database.query(`
              SELECT * FROM parcels 
              WHERE user_id = ? 
                AND (tracking_number LIKE ? OR description LIKE ? OR supplier LIKE ?)
              ORDER BY created_at DESC
              LIMIT 10
            `, [user.id, searchTerm, searchTerm, searchTerm]);
            
            if (results.length === 0) {
              await bot.sendMessage(chatId, '❌ По вашему запросу ничего не найдено.');
              return;
            }
            
            let searchResults = `🔍 <b>Результаты поиска:</b>\n\n`;
            
            results.forEach((parcel, index) => {
              const statusEmoji = getStatusEmoji(parcel.status);
              const statusText = getStatusText(parcel.status);
              
              searchResults += `${index + 1}. ${statusEmoji} <b>${parcel.tracking_number}</b>\n`;
              searchResults += `   ${parcel.description || 'Без описания'}\n`;
              searchResults += `   🏷️ Статус: ${statusText}\n`;
              if (parcel.supplier) {
                searchResults += `   🏪 Поставщик: ${parcel.supplier}\n`;
              }
              searchResults += `   📅 Добавлена: ${new Date(parcel.created_at).toLocaleDateString('ru-RU')}\n\n`;
            });
            
            await bot.sendMessage(chatId, searchResults, { parse_mode: 'HTML' });
          });
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Отслеживание конкретной посылки
      else if (data.startsWith('track_parcel:')) {
        const trackingNumber = data.split(':')[1];
        
        const parcel = await database.get(
          'SELECT * FROM parcels WHERE tracking_number = ?',
          [trackingNumber]
        );
        
        if (!parcel) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Посылка не найдена' });
          return;
        }
        
        const statusEmoji = getStatusEmoji(parcel.status);
        const statusText = getStatusText(parcel.status);
        
        let trackInfo = `📦 <b>Отслеживание посылки:</b>\n\n`;
        trackInfo += `<b>Трек-номер:</b> ${parcel.tracking_number}\n`;
        trackInfo += `<b>Описание:</b> ${parcel.description || 'Без описания'}\n`;
        trackInfo += `<b>Статус:</b> ${statusEmoji} ${statusText}\n`;
        trackInfo += `<b>Поставщик:</b> ${parcel.supplier || 'Не указан'}\n`;
        
        if (parcel.expected_date) {
          const expectedDate = new Date(parcel.expected_date);
          const daysLeft = Math.ceil((expectedDate - new Date()) / (1000 * 60 * 60 * 24));
          trackInfo += `<b>Ожидается:</b> ${expectedDate.toLocaleDateString('ru-RU')} (через ${daysLeft} дней)\n`;
        }
        
        if (parcel.actual_date) {
          trackInfo += `<b>Фактическая дата:</b> ${new Date(parcel.actual_date).toLocaleDateString('ru-RU')}\n`;
        }
        
        if (parcel.notes) {
          trackInfo += `<b>Заметки:</b> ${parcel.notes}\n`;
        }
        
        trackInfo += `\n<b>Дата добавления:</b> ${new Date(parcel.created_at).toLocaleString('ru-RU')}\n`;
        trackInfo += `<b>Последнее обновление:</b> ${new Date(parcel.updated_at).toLocaleString('ru-RU')}\n`;
        
        await bot.editMessageText(trackInfo, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Обновить статус', callback_data: `update_parcel_status:${parcel.id}` },
                { text: '⏰ Напомнить', callback_data: `set_reminder:${parcel.id}` }
              ],
              [
                { text: '✏️ Редактировать', callback_data: `edit_parcel:${parcel.id}` },
                { text: '🗑️ Удалить', callback_data: `delete_parcel:${parcel.id}` }
              ],
              [
                { text: '↩️ Назад к списку', callback_data: 'refresh_parcels' }
              ]
            ]
          }
        }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Обновление статуса посылки
      else if (data.startsWith('update_parcel_status:')) {
        const parcelId = data.split(':')[1];
        
        await bot.editMessageText(
          '🔄 Выберите новый статус для посылки:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🛒 Заказан', callback_data: `set_parcel_status:${parcelId}:ordered` },
                  { text: '🚚 Отправлен', callback_data: `set_parcel_status:${parcelId}:shipped` }
                ],
                [
                  { text: '🚛 В пути', callback_data: `set_parcel_status:${parcelId}:in_transit` },
                  { text: '🏠 Прибыл', callback_data: `set_parcel_status:${parcelId}:arrived` }
                ],
                [
                  { text: '✅ Получен', callback_data: `set_parcel_status:${parcelId}:received` },
                  { text: '❌ Отмена', callback_data: `track_parcel:${parcelId}` }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Установка статуса посылки
      else if (data.startsWith('set_parcel_status:')) {
        const parts = data.split(':');
        const parcelId = parts[1];
        const status = parts[2];
        
        const updateData = {
          status: status,
          updated_at: new Date()
        };
        
        // Если статус "получен", устанавливаем фактическую дату
        if (status === 'received') {
          updateData.actual_date = new Date();
        }
        
        await database.update('parcels', 
          { id: parcelId },
          updateData
        );
        
        const parcel = await database.get('SELECT * FROM parcels WHERE id = ?', [parcelId]);
        const user = await database.get('SELECT * FROM users WHERE id = ?', [parcel.user_id]);
        
        // Отправляем уведомление пользователю
        if (user && user.notifications_enabled) {
          try {
            await bot.sendMessage(user.telegram_id,
              `📦 <b>Статус посылки обновлен!</b>\n\n` +
              `Трек-номер: ${parcel.tracking_number}\n` +
              `Новый статус: ${getStatusEmoji(status)} ${getStatusText(status)}\n\n` +
              `Если статус неверный, вы можете изменить его в меню посылок.`,
              { parse_mode: 'HTML' }
            );
          } catch (error) {
            console.error('Ошибка при отправке уведомления:', error);
          }
        }
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Статус обновлен!' });
        
        // Возвращаемся к отслеживанию посылки
        if (parcel && parcel.tracking_number) {
          bot.emit('callback_query', {
            ...callbackQuery,
            data: `track_parcel:${parcel.tracking_number}`
          });
        }
      }
      
      // Удаление посылки
      else if (data.startsWith('delete_parcel:')) {
        const parcelId = data.split(':')[1];
        
        await bot.editMessageText(
          '🗑️ <b>Удаление посылки</b>\n\n' +
          'Вы уверены, что хотите удалить эту посылку?\n' +
          'Это действие нельзя отменить.',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Да, удалить', callback_data: `confirm_delete_parcel:${parcelId}` },
                  { text: '❌ Нет, отменить', callback_data: `track_parcel:${parcelId}` }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Подтверждение удаления посылки
      else if (data.startsWith('confirm_delete_parcel:')) {
        const parcelId = data.split(':')[1];
        
        const parcel = await database.get('SELECT * FROM parcels WHERE id = ?', [parcelId]);
        
        await database.execute('DELETE FROM parcels WHERE id = ?', [parcelId]);
        
        await bot.editMessageText(
          `✅ Посылка ${parcel.tracking_number} удалена.`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Посылка удалена!' });
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике посылок:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
  
  // Вспомогательные функции
  function getStatusEmoji(status) {
    const emojiMap = {
      'ordered': '🛒',
      'shipped': '🚚',
      'in_transit': '🚛',
      'arrived': '🏠',
      'received': '✅'
    };
    return emojiMap[status] || '📦';
  }
  
  function getStatusText(status) {
    const textMap = {
      'ordered': 'Заказан',
      'shipped': 'Отправлен',
      'in_transit': 'В пути',
      'arrived': 'Прибыл',
      'received': 'Получен'
    };
    return textMap[status] || status;
  }
}

module.exports = parcelHandlers;