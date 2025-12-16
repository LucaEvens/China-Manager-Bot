const database = require('../database/connection');
const keyboards = require('../keyboards');

function warehouseHandlers(bot) {
  
  // Состояние склада
  bot.onText(/\/warehouse/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Проверяем, является ли пользователь администратором
      const isAdmin = user.is_admin;
      
      // Получаем товары со склада
      const items = await database.query(`
        SELECT * FROM warehouse 
        ORDER BY 
          CASE WHEN quantity < min_quantity THEN 0 ELSE 1 END,
          quantity ASC,
          name
        LIMIT 20
      `);
      
      if (items.length === 0) {
        await bot.sendMessage(chatId, 
          '📭 На складе пока нет товаров.\n\n' +
          'Добавьте первый товар с помощью команды /add_item',
          keyboards.mainMenu()
        );
        return;
      }
      
      let message = '📊 <b>Состояние склада:</b>\n\n';
      let lowStockCount = 0;
      
      items.forEach((item, index) => {
        const isLowStock = item.quantity < item.min_quantity;
        const stockEmoji = isLowStock ? '⚠️' : '✅';
        
        if (isLowStock) lowStockCount++;
        
        message += `${index + 1}. ${stockEmoji} <b>${item.name}</b>\n`;
        message += `   SKU: ${item.sku}\n`;
        message += `   Количество: ${item.quantity} / ${item.min_quantity}\n`;
        if (item.location) {
          message += `   Место: ${item.location}\n`;
        }
        message += `   Обновлено: ${new Date(item.last_updated).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      if (lowStockCount > 0) {
        message += `⚠️ <b>Внимание:</b> ${lowStockCount} товаров с низким запасом!\n`;
      }
      
      const inlineKeyboard = [
        [
          { text: '🔍 Поиск товара', callback_data: 'search_item' },
          { text: '🔄 Обновить', callback_data: 'refresh_warehouse' }
        ]
      ];
      
      if (isAdmin) {
        inlineKeyboard.unshift([
          { text: '➕ Добавить товар', callback_data: 'add_item_btn' },
          { text: '✏️ Редактировать', callback_data: 'edit_warehouse' }
        ]);
      }
      
      inlineKeyboard.push([
        { text: '⚠️ Низкий запас', callback_data: 'low_stock_items' },
        { text: '📊 Статистика', callback_data: 'warehouse_stats' }
      ]);
      
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении состояния склада:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке склада.');
    }
  });
  
  // Товары с низким запасом
  bot.onText(/\/low_stock/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем товары с низким запасом
      const lowStockItems = await database.query(`
        SELECT * FROM warehouse 
        WHERE quantity < min_quantity
        ORDER BY quantity ASC, name
      `);
      
      if (lowStockItems.length === 0) {
        await bot.sendMessage(chatId, 
          '✅ Все товары на складе в достаточном количестве!\n\n' +
          'Нет товаров с низким запасом.',
          keyboards.mainMenu()
        );
        return;
      }
      
      let message = '⚠️ <b>Товары с низким запасом:</b>\n\n';
      
      lowStockItems.forEach((item, index) => {
        const percentage = Math.round((item.quantity / item.min_quantity) * 100);
        const stockLevel = item.quantity <= 0 ? '❌ Нет в наличии' : 
                          item.quantity < item.min_quantity * 0.3 ? '🔴 Критический' :
                          item.quantity < item.min_quantity * 0.5 ? '🟠 Низкий' : '🟡 Внимание';
        
        message += `${index + 1}. <b>${item.name}</b>\n`;
        message += `   SKU: ${item.sku}\n`;
        message += `   В наличии: ${item.quantity} из ${item.min_quantity} (${percentage}%)\n`;
        message += `   Уровень: ${stockLevel}\n`;
        if (item.location) {
          message += `   Место: ${item.location}\n`;
        }
        message += `   Необходимо: ${item.min_quantity - item.quantity} шт.\n\n`;
      });
      
      message += `<b>Всего товаров с низким запасом:</b> ${lowStockItems.length}`;
      
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Уведомить админа', callback_data: 'notify_admin_low_stock' },
              { text: '📋 Список для заказа', callback_data: 'order_list_low_stock' }
            ],
            [
              { text: '↩️ Назад к складу', callback_data: 'refresh_warehouse' },
              { text: '🔄 Обновить', callback_data: 'refresh_low_stock' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении товаров с низким запасом:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке данных.');
    }
  });
  
  // Поиск товара
  bot.onText(/\/find_item/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      await bot.sendMessage(chatId, 
        '🔍 Введите SKU, название или часть названия товара:',
        {
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      ).then(sentMsg => {
        bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
          const searchTerm = `%${replyMsg.text.trim()}%`;
          
          const items = await database.query(`
            SELECT * FROM warehouse 
            WHERE sku LIKE ? OR name LIKE ? OR location LIKE ?
            ORDER BY name
            LIMIT 10
          `, [searchTerm, searchTerm, searchTerm]);
          
          if (items.length === 0) {
            await bot.sendMessage(chatId, '❌ По вашему запросу ничего не найдено.');
            return;
          }
          
          let searchResults = `🔍 <b>Результаты поиска:</b>\n\n`;
          
          items.forEach((item, index) => {
            const isLowStock = item.quantity < item.min_quantity;
            const stockEmoji = isLowStock ? '⚠️' : '✅';
            
            searchResults += `${index + 1}. ${stockEmoji} <b>${item.name}</b>\n`;
            searchResults += `   SKU: ${item.sku}\n`;
            searchResults += `   Количество: ${item.quantity} / ${item.min_quantity}\n`;
            if (item.location) {
              searchResults += `   Место: ${item.location}\n`;
            }
            searchResults += `   Обновлено: ${new Date(item.last_updated).toLocaleDateString('ru-RU')}\n\n`;
          });
          
          await bot.sendMessage(chatId, searchResults, { parse_mode: 'HTML' });
        });
      });
      
    } catch (error) {
      console.error('Ошибка при поиске товара:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при поиске.');
    }
  });
  
  // Добавление товара (только для админов)
  bot.onText(/\/add_item/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE', [msg.from.id]);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Эта команда доступна только администраторам.');
        return;
      }
      
      await bot.sendMessage(chatId, 
        '➕ <b>Добавление товара на склад:</b>\n\n' +
        'Введите данные в формате:\n\n' +
        '<code>SKU, Название, Количество, Мин.запас, Местоположение</code>\n\n' +
        'Пример:\n' +
        '<code>SKU001, Смартфон Xiaomi, 50, 10, A-1</code>\n\n' +
        'Примечание: SKU должен быть уникальным.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      ).then(sentMsg => {
        bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
          try {
            const text = replyMsg.text.trim();
            const parts = text.split(',').map(s => s.trim());
            
            const sku = parts[0];
            const name = parts[1] || '';
            const quantity = parseInt(parts[2]) || 0;
            const minQuantity = parseInt(parts[3]) || 10;
            const location = parts[4] || null;
            
            if (!sku || !name) {
              await bot.sendMessage(chatId, '❌ SKU и название обязательны.');
              return;
            }
            
            // Проверяем, существует ли уже товар с таким SKU
            const existingItem = await database.get(
              'SELECT * FROM warehouse WHERE sku = ?',
              [sku]
            );
            
            if (existingItem) {
              await bot.sendMessage(chatId, 
                '❌ Товар с таким SKU уже существует.\n' +
                'Используйте другой SKU или обновите существующий товар.'
              );
              return;
            }
            
            // Добавляем товар
            await database.insert('warehouse', {
              sku: sku,
              name: name,
              quantity: quantity,
              min_quantity: minQuantity,
              location: location,
              last_updated: new Date()
            });
            
            let responseMessage = `✅ Товар добавлен на склад!\n\n` +
              `<b>SKU:</b> ${sku}\n` +
              `<b>Название:</b> ${name}\n` +
              `<b>Количество:</b> ${quantity}\n` +
              `<b>Мин. запас:</b> ${minQuantity}\n`;
            
            if (location) {
              responseMessage += `<b>Местоположение:</b> ${location}\n`;
            }
            
            await bot.sendMessage(chatId, responseMessage, { parse_mode: 'HTML' });
            
          } catch (error) {
            console.error('Ошибка при добавлении товара:', error);
            
            if (error.code === 'ER_DUP_ENTRY') {
              await bot.sendMessage(chatId, '❌ Товар с таким SKU уже существует.');
            } else {
              await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении товара.');
            }
          }
        });
      });
      
    } catch (error) {
      console.error('Ошибка при добавлении товара:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Обработка callback-запросов для склада
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Добавление товара через кнопку
      if (data === 'add_item_btn') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/add_item' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Обновление склада
      else if (data === 'refresh_warehouse') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновление...' });
        bot.emit('text', { ...callbackQuery.message, text: '/warehouse' });
      }
      
      // Товары с низким запасом
      else if (data === 'low_stock_items') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/low_stock' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Обновление низкого запаса
      else if (data === 'refresh_low_stock') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновление...' });
        bot.emit('text', { ...callbackQuery.message, text: '/low_stock' });
      }
      
      // Поиск товара
      else if (data === 'search_item') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/find_item' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Статистика склада
      else if (data === 'warehouse_stats') {
        const stats = await database.query(`
          SELECT 
            COUNT(*) as total_items,
            SUM(quantity) as total_quantity,
            SUM(CASE WHEN quantity < min_quantity THEN 1 ELSE 0 END) as low_stock_items,
            SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
            AVG(quantity) as avg_quantity,
            MIN(quantity) as min_quantity_in_stock,
            MAX(quantity) as max_quantity_in_stock
          FROM warehouse
        `);
        
        const stat = stats[0];
        
        await bot.editMessageText(
          `📊 <b>Статистика склада:</b>\n\n` +
          `📦 Всего товаров: ${stat.total_items}\n` +
          `🧮 Общее количество: ${stat.total_quantity || 0}\n` +
          `⚠️ Товаров с низким запасом: ${stat.low_stock_items}\n` +
          `❌ Товаров нет в наличии: ${stat.out_of_stock}\n` +
          `📈 Среднее количество: ${Math.round(stat.avg_quantity || 0)}\n` +
          `📉 Минимальное количество: ${stat.min_quantity_in_stock || 0}\n` +
          `📈 Максимальное количество: ${stat.max_quantity_in_stock || 0}\n\n` +
          `📅 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📋 Детальный отчет', callback_data: 'detailed_warehouse_report' },
                  { text: '📊 Графики', callback_data: 'warehouse_charts' }
                ],
                [
                  { text: '↩️ Назад к складу', callback_data: 'refresh_warehouse' },
                  { text: '🔄 Обновить', callback_data: 'warehouse_stats' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Уведомление админа о низком запасе
      else if (data === 'notify_admin_low_stock') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Получаем товары с низким запасом
        const lowStockItems = await database.query(`
          SELECT * FROM warehouse 
          WHERE quantity < min_quantity
          ORDER BY quantity ASC
          LIMIT 10
        `);
        
        if (lowStockItems.length === 0) {
          await bot.answerCallbackQuery(callbackQuery.id, { 
            text: '✅ Нет товаров с низким запасом' 
          });
          return;
        }
        
        // Получаем администраторов
        const admins = await database.query(
          'SELECT telegram_id FROM users WHERE is_admin = TRUE'
        );
        
        let notificationText = `⚠️ <b>Уведомление о низком запасе</b>\n\n`;
        notificationText += `Отправитель: ${user.first_name}\n\n`;
        notificationText += `<b>Товары с низким запасом:</b>\n\n`;
        
        lowStockItems.forEach((item, index) => {
          notificationText += `${index + 1}. ${item.name}\n`;
          notificationText += `   SKU: ${item.sku}\n`;
          notificationText += `   В наличии: ${item.quantity} из ${item.min_quantity}\n`;
          notificationText += `   Необходимо: ${item.min_quantity - item.quantity} шт.\n`;
          if (item.location) {
            notificationText += `   Место: ${item.location}\n`;
          }
          notificationText += '\n';
        });
        
        // Отправляем уведомления администраторам
        let sentCount = 0;
        for (const admin of admins) {
          try {
            await bot.sendMessage(admin.telegram_id, notificationText, {
              parse_mode: 'HTML'
            });
            sentCount++;
          } catch (error) {
            console.error('Ошибка при отправке уведомления админу:', error);
          }
        }
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `✅ Уведомление отправлено ${sentCount} администраторам` 
        });
      }
      
      // Список для заказа (низкий запас)
      else if (data === 'order_list_low_stock') {
        const lowStockItems = await database.query(`
          SELECT * FROM warehouse 
          WHERE quantity < min_quantity
          ORDER BY (min_quantity - quantity) DESC, name
        `);
        
        if (lowStockItems.length === 0) {
          await bot.answerCallbackQuery(callbackQuery.id, { 
            text: '✅ Нет товаров с низким запасом' 
          });
          return;
        }
        
        let orderList = `📋 <b>Список для заказа (низкий запас):</b>\n\n`;
        
        lowStockItems.forEach((item, index) => {
          const orderQuantity = item.min_quantity - item.quantity;
          orderList += `${index + 1}. ${item.name}\n`;
          orderList += `   SKU: ${item.sku}\n`;
          orderList += `   Заказать: ${orderQuantity} шт.\n`;
          orderList += `   Текущий запас: ${item.quantity}\n`;
          orderList += `   Мин. запас: ${item.min_quantity}\n\n`;
        });
        
        orderList += `<b>Итого товаров для заказа:</b> ${lowStockItems.length}`;
        
        await bot.editMessageText(orderList, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📧 Отправить список', callback_data: 'send_order_list' },
                { text: '📋 Копировать', callback_data: 'copy_order_list' }
              ],
              [
                { text: '↩️ Назад', callback_data: 'refresh_low_stock' }
              ]
            ]
          }
        }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Редактирование склада
      else if (data === 'edit_warehouse') {
        // Получаем все товары для редактирования
        const items = await database.query(`
          SELECT * FROM warehouse 
          ORDER BY name
          LIMIT 20
        `);
        
        let editText = '✏️ <b>Редактирование склада:</b>\n\n';
        editText += 'Выберите товар для редактирования:\n\n';
        
        items.forEach((item, index) => {
          const isLowStock = item.quantity < item.min_quantity;
          const stockEmoji = isLowStock ? '⚠️' : '✅';
          
          editText += `${index + 1}. ${stockEmoji} ${item.name}\n`;
          editText += `   SKU: ${item.sku} | Количество: ${item.quantity}\n\n`;
        });
        
        const keyboard = items.map(item => [
          {
            text: `${item.name} (${item.quantity} шт.)`,
            callback_data: `edit_item:${item.id}`
          }
        ]);
        
        keyboard.push([{ text: '↩️ Назад к складу', callback_data: 'refresh_warehouse' }]);
        
        await bot.editMessageText(editText, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Редактирование конкретного товара
      else if (data.startsWith('edit_item:')) {
        const itemId = data.split(':')[1];
        
        const item = await database.get('SELECT * FROM warehouse WHERE id = ?', [itemId]);
        
        await bot.editMessageText(
          `✏️ <b>Редактирование товара:</b>\n\n` +
          `<b>Название:</b> ${item.name}\n` +
          `<b>SKU:</b> ${item.sku}\n` +
          `<b>Количество:</b> ${item.quantity}\n` +
          `<b>Мин. запас:</b> ${item.min_quantity}\n` +
          `<b>Местоположение:</b> ${item.location || 'Не указано'}\n\n` +
          'Выберите действие:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✏️ Изменить количество', callback_data: `change_quantity:${itemId}` },
                  { text: '🏷️ Изменить данные', callback_data: `change_item_data:${itemId}` }
                ],
                [
                  { text: '📦 Пополнить', callback_data: `restock_item:${itemId}` },
                  { text: '📥 Списать', callback_data: `remove_stock:${itemId}` }
                ],
                [
                  { text: '🗑️ Удалить товар', callback_data: `delete_item:${itemId}` },
                  { text: '↩️ Назад', callback_data: 'edit_warehouse' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике склада:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
}

module.exports = warehouseHandlers;