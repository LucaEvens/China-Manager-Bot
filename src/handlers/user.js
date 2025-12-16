const database = require('../database/connection');
const keyboards = require('../keyboards');

function userHandlers(bot) {
  
  // Профиль пользователя
  bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user) {
        await bot.sendMessage(chatId, 
          '❌ Вы не зарегистрированы в системе.\n' +
          'Используйте /request_access для получения доступа.',
          keyboards.backToStart()
        );
        return;
      }
      
      // Получаем статистику пользователя
      const [parcelStats] = await database.query(`
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
      
      const stats = parcelStats[0] || {};
      
      const profileText = `
👤 <b>Ваш профиль:</b>

<b>Основная информация:</b>
ID: ${user.id}
Имя: ${user.first_name}
Фамилия: ${user.last_name || 'Не указана'}
Username: @${user.username || 'Не указан'}
Telegram ID: ${user.telegram_id}

<b>Статус:</b>
Аккаунт: ${user.is_active ? '✅ Активен' : '❌ Неактивен'}
Роль: ${user.is_admin ? '👑 Администратор' : '👤 Пользователь'}

<b>Статистика посылок:</b>
Всего: ${stats.total || 0}
🛒 Заказано: ${stats.ordered || 0}
🚚 Отправлено: ${stats.shipped || 0}
🚛 В пути: ${stats.in_transit || 0}
🏠 Прибыло: ${stats.arrived || 0}
✅ Получено: ${stats.received || 0}

<b>Дата регистрации:</b>
${new Date(user.created_at).toLocaleString('ru-RU')}
      `;
      
      await bot.sendMessage(chatId, profileText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Редактировать профиль', callback_data: 'edit_profile_from_user' },
              { text: '📊 Подробная статистика', callback_data: 'detailed_stats' }
            ],
            [
              { text: '📋 История активности', callback_data: 'activity_history' },
              { text: '🔑 Сменить доступ', callback_data: 'change_access' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при загрузке профиля:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при загрузке профиля.');
    }
  });
  
  // Мои данные
  bot.onText(/\/my_data/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      // Получаем все данные пользователя
      const userData = await database.query(`
        SELECT 
          u.*,
          (SELECT COUNT(*) FROM parcels p WHERE p.user_id = u.id) as total_parcels,
          (SELECT COUNT(*) FROM access_requests ar WHERE ar.user_id = u.id) as total_requests,
          (SELECT MAX(created_at) FROM parcels p WHERE p.user_id = u.id) as last_parcel_date
        FROM users u
        WHERE u.id = ?
      `, [user.id]);
      
      const data = userData[0];
      
      // Форматируем данные для отправки
      const userInfo = `
📋 <b>Ваши данные в системе:</b>

<b>Личная информация:</b>
👤 ID: ${data.id}
👤 Telegram ID: ${data.telegram_id}
👤 Имя: ${data.first_name}
👤 Фамилия: ${data.last_name || 'Не указана'}
👤 Username: @${data.username || 'Не указан'}

<b>Статус аккаунта:</b>
✅ Активен: ${data.is_active ? 'Да' : 'Нет'}
👑 Администратор: ${data.is_admin ? 'Да' : 'Нет'}

<b>Даты:</b>
📅 Регистрация: ${new Date(data.created_at).toLocaleString('ru-RU')}
📅 Последнее обновление: ${new Date(data.updated_at).toLocaleString('ru-RU')}

<b>Статистика:</b>
📦 Всего посылок: ${data.total_parcels}
📋 Запросов доступа: ${data.total_requests}
📅 Последняя посылка: ${data.last_parcel_date ? new Date(data.last_parcel_date).toLocaleDateString('ru-RU') : 'Нет посылок'}

<b>Настройки:</b>
🔔 Уведомления: ${data.notifications_enabled ? 'Включены' : 'Выключены'}
🌐 Язык: ${data.language || 'Русский'}
🕐 Часовой пояс: ${data.timezone || 'Не установлен'}
      `;
      
      await bot.sendMessage(chatId, userInfo, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📥 Экспорт данных', callback_data: 'export_my_data' },
              { text: '🗑️ Удалить данные', callback_data: 'delete_my_data' }
            ],
            [
              { text: '↩️ Назад в профиль', callback_data: 'back_to_profile' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении данных:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при получении ваших данных.');
    }
  });
  
  // Обработка callback-запросов для пользователя
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Редактирование профиля из пользовательского раздела
      if (data === 'edit_profile_from_user') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/settings' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Подробная статистика
      else if (data === 'detailed_stats') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Получаем детальную статистику
        const [monthlyStats] = await database.query(`
          SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received_count
          FROM parcels 
          WHERE user_id = ? 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
          GROUP BY DATE_FORMAT(created_at, '%Y-%m')
          ORDER BY month DESC
        `, [user.id]);
        
        const [supplierStats] = await database.query(`
          SELECT 
            supplier,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received_count
          FROM parcels 
          WHERE user_id = ?
          GROUP BY supplier
          ORDER BY count DESC
          LIMIT 10
        `, [user.id]);
        
        let statsText = '📊 <b>Подробная статистика:</b>\n\n';
        
        statsText += '<b>📅 По месяцам (последние 6 месяцев):</b>\n';
        if (monthlyStats.length === 0) {
          statsText += 'Нет данных\n\n';
        } else {
          monthlyStats.forEach(stat => {
            statsText += `${stat.month}: ${stat.count} посылок (${stat.received_count} получено)\n`;
          });
          statsText += '\n';
        }
        
        statsText += '<b>🏪 По поставщикам:</b>\n';
        if (supplierStats.length === 0) {
          statsText += 'Нет данных\n';
        } else {
          supplierStats.forEach(stat => {
            statsText += `${stat.supplier}: ${stat.count} (${stat.received_count} получено)\n`;
          });
        }
        
        await bot.editMessageText(statsText, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📈 Графики', callback_data: 'show_charts' },
                { text: '📋 Экспорт', callback_data: 'export_stats' }
              ],
              [
                { text: '↩️ Назад в профиль', callback_data: 'back_to_profile' }
              ]
            ]
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // История активности
      else if (data === 'activity_history') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Получаем историю активности (посылки и действия)
        const activities = await database.query(`
          (SELECT 
            'parcel' as type,
            tracking_number as title,
            status,
            created_at,
            description as details
          FROM parcels 
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 10)
          
          UNION ALL
          
          (SELECT 
            'access_request' as type,
            'Запрос доступа' as title,
            status,
            created_at,
            CONCAT('Статус: ', status) as details
          FROM access_requests 
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 5)
          
          ORDER BY created_at DESC
          LIMIT 15
        `, [user.id, user.id]);
        
        let activityText = '📋 <b>История активности:</b>\n\n';
        
        if (activities.length === 0) {
          activityText += 'Нет записей активности.\n';
        } else {
          activities.forEach((activity, index) => {
            const typeEmoji = activity.type === 'parcel' ? '📦' : '🔐';
            const date = new Date(activity.created_at).toLocaleString('ru-RU');
            
            activityText += `${index + 1}. ${typeEmoji} ${activity.title}\n`;
            activityText += `   ${activity.details}\n`;
            activityText += `   📅 ${date}\n\n`;
          });
        }
        
        await bot.editMessageText(activityText, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Обновить', callback_data: 'refresh_activity' },
                { text: '📋 Полная история', callback_data: 'full_activity' }
              ],
              [
                { text: '↩️ Назад в профиль', callback_data: 'back_to_profile' }
              ]
            ]
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Возврат в профиль
      else if (data === 'back_to_profile') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/profile' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Экспорт данных
      else if (data === 'export_my_data') {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: 'Функция экспорта данных в разработке...' 
        });
      }
      
      // Удаление данных
      else if (data === 'delete_my_data') {
        await bot.editMessageText(
          '⚠️ <b>Удаление данных:</b>\n\n' +
          'Вы уверены, что хотите удалить все ваши данные из системы?\n\n' +
          'Это действие удалит:\n' +
          '• Ваш профиль\n' +
          '• Все ваши посылки\n' +
          '• Историю запросов\n' +
          '• Настройки\n\n' +
          'Это действие необратимо!',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Да, удалить все', callback_data: 'confirm_delete_data' },
                  { text: '❌ Нет, отменить', callback_data: 'back_to_profile' }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Подтверждение удаления данных
      else if (data === 'confirm_delete_data') {
        const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [callbackQuery.from.id]);
        
        // Удаляем все данные пользователя
        await database.execute('DELETE FROM parcels WHERE user_id = ?', [user.id]);
        await database.execute('DELETE FROM access_requests WHERE user_id = ?', [user.id]);
        await database.execute('DELETE FROM users WHERE id = ?', [user.id]);
        
        await bot.editMessageText(
          '✅ Все ваши данные успешно удалены из системы.',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Данные удалены!' });
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике пользователя:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
}

module.exports = userHandlers;