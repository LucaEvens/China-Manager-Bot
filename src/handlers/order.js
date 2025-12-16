const database = require('../database/connection');
const keyboards = require('../keyboards');

function orderHandlers(bot) {
  
  // Просмотр заказов
  bot.onText(/\/orders/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем заказы пользователя
      const orders = await database.query(`
        SELECT * FROM parcels 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 10
      `, [user.id]);
      
      if (orders.length === 0) {
        await bot.sendMessage(chatId, 
          '📭 У вас пока нет заказов.\n\n' +
          'Добавьте свой первый заказ с помощью команды /add_order'
        );
        return;
      }
      
      let message = '📋 <b>Ваши заказы:</b>\n\n';
      
      orders.forEach((order, index) => {
        const statusEmoji = getStatusEmoji(order.status);
        const date = order.expected_date ? 
          `📅 ${new Date(order.expected_date).toLocaleDateString('ru-RU')}` : 
          '📅 Дата не указана';
        
        message += `${index + 1}. ${statusEmoji} <b>${order.tracking_number}</b>\n`;
        message += `   📦 ${order.description || 'Без описания'}\n`;
        message += `   🏷️ Статус: ${getStatusText(order.status)}\n`;
        message += `   ${date}\n\n`;
      });
      
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Добавить заказ', callback_data: 'add_order' },
              { text: '🔄 Обновить', callback_data: 'refresh_orders' }
            ],
            [
              { text: '📊 Статистика', callback_data: 'order_stats' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении заказов:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке заказов.');
    }
  });
  
  // Добавление заказа
  bot.onText(/\/add_order/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, 
      '📝 Для добавления заказа введите данные в формате:\n\n' +
      '<code>Трек-номер, Описание, Поставщик</code>\n\n' +
      'Пример:\n' +
      '<code>RU123456789CN, Смартфон Xiaomi, AliExpress</code>',
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
          const [trackingNumber, description, supplier] = text.split(',').map(s => s.trim());
          
          if (!trackingNumber || !description || !supplier) {
            await bot.sendMessage(chatId, '❌ Неверный формат. Пожалуйста, используйте указанный формат.');
            return;
          }
          
          const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [replyMsg.from.id]);
          
          if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден.');
            return;
          }
          
          // Добавляем заказ
          await database.insert('parcels', {
            tracking_number: trackingNumber,
            description: description,
            supplier: supplier,
            user_id: user.id,
            status: 'ordered',
            created_at: new Date()
          });
          
          await bot.sendMessage(chatId, 
            `✅ Заказ добавлен!\n\n` +
            `📦 <b>Трек-номер:</b> ${trackingNumber}\n` +
            `📝 <b>Описание:</b> ${description}\n` +
            `🏪 <b>Поставщик:</b> ${supplier}\n` +
            `📊 <b>Статус:</b> Заказан`,
            { parse_mode: 'HTML' }
          );
          
        } catch (error) {
          console.error('Ошибка при добавлении заказа:', error);
          
          if (error.code === 'ER_DUP_ENTRY') {
            await bot.sendMessage(chatId, '❌ Заказ с таким трек-номером уже существует.');
          } else {
            await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении заказа.');
          }
        }
      });
    });
  });
  
  // Обновление статуса заказа
  bot.onText(/\/update_status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем последние заказы
      const orders = await database.query(`
        SELECT id, tracking_number, description, status 
        FROM parcels 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [user.id]);
      
      if (orders.length === 0) {
        await bot.sendMessage(chatId, '❌ У вас нет заказов для обновления.');
        return;
      }
      
      const keyboard = orders.map(order => [
        {
          text: `${order.tracking_number} - ${getStatusEmoji(order.status)}`,
          callback_data: `update_order_status:${order.id}`
        }
      ]);
      
      keyboard.push([{ text: '❌ Отмена', callback_data: 'cancel_update_status' }]);
      
      await bot.sendMessage(chatId, 
        '📊 Выберите заказ для обновления статуса:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
      
    } catch (error) {
      console.error('Ошибка при обновлении статуса:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Обработка callback-запросов для заказов
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Обновление статуса заказа
      if (data.startsWith('update_order_status:')) {
        const orderId = data.split(':')[1];
        
        await bot.editMessageText(
          '🔄 Выберите новый статус для заказа:',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🛒 Заказан', callback_data: `set_status:${orderId}:ordered` },
                  { text: '🚚 Отправлен', callback_data: `set_status:${orderId}:shipped` }
                ],
                [
                  { text: '🚛 В пути', callback_data: `set_status:${orderId}:in_transit` },
                  { text: '🏠 Прибыл', callback_data: `set_status:${orderId}:arrived` }
                ],
                [
                  { text: '✅ Получен', callback_data: `set_status:${orderId}:received` },
                  { text: '❌ Отмена', callback_data: 'cancel_status_update' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Установка статуса
      else if (data.startsWith('set_status:')) {
        const [, orderId, status] = data.split(':');
        
        const statusText = getStatusText(status);
        const statusEmoji = getStatusEmoji(status);
        
        await database.update('parcels', 
          { id: orderId },
          { status: status, updated_at: new Date() }
        );
        
        const order = await database.get('SELECT * FROM parcels WHERE id = ?', [orderId]);
        
        await bot.editMessageText(
          `✅ Статус заказа обновлен!\n\n` +
          `📦 Трек-номер: ${order.tracking_number}\n` +
          `📝 Описание: ${order.description}\n` +
          `🔄 Новый статус: ${statusEmoji} ${statusText}`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Статус обновлен!' });
      }
      
      // Отмена обновления статуса
      else if (data === 'cancel_status_update' || data === 'cancel_update_status') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Обновление списка заказов
      else if (data === 'refresh_orders') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновление...' });
        
        // Здесь можно переотправить список заказов
        bot.emit('text', { ...callbackQuery.message, text: '/orders' });
      }
      
      // Добавление заказа через callback
      else if (data === 'add_order') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/add_order' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Статистика заказов
      else if (data === 'order_stats') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        const stats = await database.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) as ordered,
            SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
            SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
            SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) as arrived,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received
          FROM parcels 
          WHERE user_id = ?
        `, [user.id]);
        
        const stat = stats[0];
        
        await bot.editMessageText(
          `📊 <b>Статистика ваших заказов:</b>\n\n` +
          `📦 Всего заказов: ${stat.total}\n` +
          `🛒 Заказано: ${stat.ordered}\n` +
          `🚚 Отправлено: ${stat.shipped}\n` +
          `🚛 В пути: ${stat.in_transit}\n` +
          `🏠 Прибыло: ${stat.arrived}\n` +
          `✅ Получено: ${stat.received}\n\n` +
          `📈 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '↩️ Назад к заказам', callback_data: 'refresh_orders' },
                  { text: '🔄 Обновить', callback_data: 'order_stats' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике заказов:', error);
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

module.exports = orderHandlers;