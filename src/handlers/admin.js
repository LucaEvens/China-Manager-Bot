const database = require('../database/connection');
const keyboards = require('../keyboards');

function adminHandlers(bot) {
  
  // Админ панель
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      // Проверяем права администратора
      const admin = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [msg.from.id]
      );
      
      if (!admin) {
        await bot.sendMessage(chatId, 
          '❌ Эта команда доступна только администраторам.',
          keyboards.mainMenu()
        );
        return;
      }
      
      // Получаем статистику
      const [usersCount] = await database.query('SELECT COUNT(*) as count FROM users');
      const [activeUsers] = await database.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE');
      const [parcelsCount] = await database.query('SELECT COUNT(*) as count FROM parcels');
      const [pendingRequests] = await database.query('SELECT COUNT(*) as count FROM access_requests WHERE status = "pending"');
      const [warehouseItems] = await database.query('SELECT COUNT(*) as count FROM warehouse');
      
      const adminText = `
👑 <b>Административная панель</b>

📊 <b>Статистика:</b>
👥 Пользователи: ${usersCount[0].count} (Активных: ${activeUsers[0].count})
📦 Посылки: ${parcelsCount[0].count}
📦 Товары на складе: ${warehouseItems[0].count}
⏳ Запросы на доступ: ${pendingRequests[0].count}

<b>Быстрые действия:</b>
      `;
      
      await bot.sendMessage(chatId, adminText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👥 Управление пользователями', callback_data: 'admin_users' },
              { text: '⏳ Запросы доступа', callback_data: 'admin_requests' }
            ],
            [
              { text: '📦 Все посылки', callback_data: 'admin_parcels' },
              { text: '📊 Управление складом', callback_data: 'admin_warehouse' }
            ],
            [
              { text: '📢 Рассылка', callback_data: 'admin_broadcast' },
              { text: '📊 Статистика', callback_data: 'admin_stats' }
            ],
            [
              { text: '⚙️ Настройки системы', callback_data: 'admin_settings' },
              { text: '📋 Логи', callback_data: 'admin_logs' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при загрузке админ панели:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке админ панели.');
    }
  });
  
  // Управление пользователями
  bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const admin = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [msg.from.id]
      );
      
      if (!admin) {
        await bot.sendMessage(chatId, '❌ Эта команда доступна только администраторам.');
        return;
      }
      
      // Получаем список пользователей
      const users = await database.query(`
        SELECT u.*, 
               (SELECT COUNT(*) FROM parcels p WHERE p.user_id = u.id) as parcel_count,
               (SELECT MAX(created_at) FROM parcels p WHERE p.user_id = u.id) as last_parcel
        FROM users u
        ORDER BY u.created_at DESC
        LIMIT 20
      `);
      
      let usersText = '👥 <b>Список пользователей:</b>\n\n';
      
      users.forEach((user, index) => {
        const status = user.is_active ? '✅ Активен' : '❌ Неактивен';
        const adminBadge = user.is_admin ? ' 👑' : '';
        const parcelCount = user.parcel_count || 0;
        
        usersText += `${index + 1}. ${user.first_name}${adminBadge}\n`;
        usersText += `   ID: ${user.id} | ${status}\n`;
        usersText += `   Посылок: ${parcelCount}\n`;
        usersText += `   Регистрация: ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      await bot.sendMessage(chatId, usersText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Обновить', callback_data: 'admin_users_refresh' },
              { text: '➕ Добавить админа', callback_data: 'admin_add_admin' }
            ],
            [
              { text: '📊 Статистика', callback_data: 'admin_users_stats' },
              { text: '📋 Экспорт', callback_data: 'admin_users_export' }
            ],
            [
              { text: '↩️ В админ панель', callback_data: 'back_to_admin' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении списка пользователей:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке пользователей.');
    }
  });
  
  // Запросы на доступ
  bot.onText(/\/requests/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const admin = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [msg.from.id]
      );
      
      if (!admin) {
        await bot.sendMessage(chatId, '❌ Эта команда доступна только администраторам.');
        return;
      }
      
      // Получаем запросы на доступ
      const requests = await database.query(`
        SELECT ar.*, u.telegram_id, u.first_name, u.last_name, u.username
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        WHERE ar.status = 'pending'
        ORDER BY ar.created_at DESC
      `);
      
      let requestsText = '⏳ <b>Запросы на доступ:</b>\n\n';
      
      if (requests.length === 0) {
        requestsText += 'Нет ожидающих запросов на доступ.';
      } else {
        requests.forEach((request, index) => {
          requestsText += `${index + 1}. ${request.first_name} ${request.last_name || ''}\n`;
          requestsText += `   @${request.username || 'Нет username'}\n`;
          requestsText += `   ID: ${request.user_id}\n`;
          requestsText += `   Запрос: ${new Date(request.created_at).toLocaleDateString('ru-RU')}\n`;
          requestsText += `   Дней ожидания: ${Math.floor((new Date() - new Date(request.created_at)) / (1000 * 60 * 60 * 24))}\n\n`;
        });
      }
      
      const inlineKeyboard = [];
      
      if (requests.length > 0) {
        // Добавляем кнопки для каждого запроса
        requests.forEach(request => {
          inlineKeyboard.push([
            { 
              text: `✅ ${request.first_name}`, 
              callback_data: `admin_approve:${request.user_id}` 
            },
            { 
              text: `❌ ${request.first_name}`, 
              callback_data: `admin_reject:${request.user_id}` 
            }
          ]);
        });
      }
      
      inlineKeyboard.push([
        { text: '🔄 Обновить', callback_data: 'admin_requests_refresh' },
        { text: '↩️ В админ панель', callback_data: 'back_to_admin' }
      ]);
      
      await bot.sendMessage(chatId, requestsText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении запросов:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке запросов.');
    }
  });
  
  // Обработка callback-запросов для админ панели
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Проверяем права администратора
      const admin = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE',
        [callbackQuery.from.id]
      );
      
      if (!admin) {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Только администраторы могут выполнять это действия.' 
        });
        return;
      }
      
      // Управление пользователями в админке
      if (data === 'admin_users') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/users' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Запросы доступа в админке
      else if (data === 'admin_requests') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/requests' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Возврат в админ панель
      else if (data === 'back_to_admin') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/admin' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Одобрение/отклонение из админки
      else if (data.startsWith('admin_approve:') || data.startsWith('admin_reject:')) {
        const [action, userId] = data.split(':');
        const isApproval = action === 'admin_approve';
        
        // Используем существующую логику из auth.js
        // Эмитируем соответствующий callback
        bot.emit('callback_query', {
          ...callbackQuery,
          data: isApproval ? `approve_access:${userId}` : `reject_access:${userId}`
        });
      }
      
      // Обновление списка пользователей
      else if (data === 'admin_users_refresh') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/users' });
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновлено!' });
      }
      
      // Обновление запросов
      else if (data === 'admin_requests_refresh') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/requests' });
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновлено!' });
      }
      
      // Все посылки
      else if (data === 'admin_parcels') {
        // Здесь можно реализовать просмотр всех посылок
        const parcels = await database.query(`
          SELECT p.*, u.first_name, u.last_name
          FROM parcels p
          JOIN users u ON p.user_id = u.id
          ORDER BY p.created_at DESC
          LIMIT 20
        `);
        
        let parcelsText = '📦 <b>Все посылки:</b>\n\n';
        
        parcels.forEach((parcel, index) => {
          const statusEmoji = getStatusEmoji(parcel.status);
          const statusText = getStatusText(parcel.status);
          
          parcelsText += `${index + 1}. ${statusEmoji} ${parcel.tracking_number}\n`;
          parcelsText += `   ${parcel.description || 'Без описания'}\n`;
          parcelsText += `   Владелец: ${parcel.first_name} ${parcel.last_name || ''}\n`;
          parcelsText += `   Статус: ${statusText}\n`;
          parcelsText += `   Дата: ${new Date(parcel.created_at).toLocaleDateString('ru-RU')}\n\n`;
        });
        
        await bot.editMessageText(parcelsText, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Обновить', callback_data: 'admin_parcels_refresh' },
                { text: '📊 Статистика', callback_data: 'admin_parcels_stats' }
              ],
              [
                { text: '↩️ В админ панель', callback_data: 'back_to_admin' }
              ]
            ]
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Управление складом
      else if (data === 'admin_warehouse') {
        // Здесь можно реализовать управление складом
        const warehouse = await database.query(`
          SELECT * FROM warehouse 
          ORDER BY quantity ASC, last_updated DESC
          LIMIT 20
        `);
        
        let warehouseText = '📊 <b>Управление складом:</b>\n\n';
        
        warehouse.forEach((item, index) => {
          const lowStock = item.quantity < item.min_quantity;
          const stockEmoji = lowStock ? '⚠️' : '✅';
          
          warehouseText += `${index + 1}. ${stockEmoji} ${item.name}\n`;
          warehouseText += `   SKU: ${item.sku} | Количество: ${item.quantity}\n`;
          warehouseText += `   Мин. запас: ${item.min_quantity} | Место: ${item.location || 'Не указано'}\n`;
          warehouseText += `   Обновлено: ${new Date(item.last_updated).toLocaleDateString('ru-RU')}\n\n`;
        });
        
        await bot.editMessageText(warehouseText, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Добавить товар', callback_data: 'admin_add_item' },
                { text: '✏️ Редактировать', callback_data: 'admin_edit_warehouse' }
              ],
              [
                { text: '📊 Низкий запас', callback_data: 'admin_low_stock' },
                { text: '📋 Инвентаризация', callback_data: 'admin_inventory' }
              ],
              [
                { text: '↩️ В админ панель', callback_data: 'back_to_admin' }
              ]
            ]
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике админки:', error);
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

module.exports = adminHandlers;