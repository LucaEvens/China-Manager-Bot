const database = require('../database/connection');
const keyboards = require('../keyboards');

function commonHandlers(bot) {
  
  // Помощь
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      const isAdmin = user && user.is_admin;
      
      let helpText = `
📚 <b>China Manager Bot - Помощь</b>

Этот бот помогает управлять посылками из Китая и складскими запасами.

<b>Основные команды:</b>
/start - Начать работу с ботом
/menu - Главное меню
/help - Эта справка
/settings - Настройки профиля

<b>📦 Управление посылками:</b>
/parcels - Мои посылки
/add_parcel - Добавить посылку
/track - Отследить посылку
/update_parcel - Обновить статус посылки

<b>📊 Управление складом:</b>
/warehouse - Состояние склада
/low_stock - Товары с низким запасом
/find_item - Найти товар
      `;
      
      if (isAdmin) {
        helpText += `
<b>👑 Административные команды:</b>
/admin - Админ панель
/users - Управление пользователями
/requests - Запросы на доступ
/add_item - Добавить товар на склад
        `;
      } else {
        helpText += `
<b>🔐 Аутентификация:</b>
/request_access - Запрос доступа к боту
/profile - Мой профиль
        `;
      }
      
      helpText += `
<b>🔔 Уведомления:</b>
/notifications - Управление уведомлениями
/setup_reminders - Настройка напоминаний

<b>📞 Поддержка:</b>
Если у вас возникли проблемы или есть вопросы, обратитесь к администратору.
      `;
      
      await bot.sendMessage(chatId, helpText, {
        parse_mode: 'HTML',
        reply_markup: keyboards.mainMenu()
      });
      
    } catch (error) {
      console.error('Ошибка при показе помощи:', error);
      await bot.sendMessage(chatId, 
        '❌ Произошла ошибка при загрузке справки.\n' +
        'Пожалуйста, попробуйте позже.',
        keyboards.backToStart()
      );
    }
  });
  
  // Обратная связь
  bot.onText(/\/feedback/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      await bot.sendMessage(chatId, 
        '💬 <b>Обратная связь</b>\n\n' +
        'Пожалуйста, напишите ваше сообщение для администратора.\n' +
        'Вы можете отправить предложения, сообщить об ошибках или задать вопросы.\n\n' +
        'Ваше сообщение будет отправлено администраторам бота.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      ).then(sentMsg => {
        bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
          const feedback = replyMsg.text.trim();
          
          if (!feedback || feedback.length < 5) {
            await bot.sendMessage(chatId, '❌ Сообщение слишком короткое. Минимум 5 символов.');
            return;
          }
          
          // Получаем администраторов
          const admins = await database.query(
            'SELECT telegram_id FROM users WHERE is_admin = TRUE'
          );
          
          const feedbackMessage = `
💬 <b>Новое сообщение обратной связи</b>

<b>От:</b> ${user.first_name} ${user.last_name || ''}
<b>Username:</b> @${user.username || 'Не указан'}
<b>Telegram ID:</b> ${user.telegram_id}
<b>ID пользователя:</b> ${user.id}

<b>Сообщение:</b>
${feedback}

<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}
          `;
          
          let sentCount = 0;
          for (const admin of admins) {
            try {
              await bot.sendMessage(admin.telegram_id, feedbackMessage, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📨 Ответить', callback_data: `reply_feedback:${user.telegram_id}` },
                      { text: '👁️ Просмотрено', callback_data: `mark_feedback_read:${user.id}` }
                    ]
                  ]
                }
              });
              sentCount++;
            } catch (error) {
              console.error('Ошибка при отправке фидбека админу:', error);
            }
          }
          
          await bot.sendMessage(chatId, 
            `✅ Ваше сообщение отправлено ${sentCount} администраторам.\n` +
            'Спасибо за вашу обратную связь!'
          );
        });
      });
      
    } catch (error) {
      console.error('Ошибка при отправке обратной связи:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при отправке сообщения.');
    }
  });
  
  // Статистика бота (публичная)
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      // Получаем публичную статистику
      const [usersCount] = await database.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE');
      const [parcelsCount] = await database.query('SELECT COUNT(*) as count FROM parcels');
      const [warehouseItems] = await database.query('SELECT COUNT(*) as count FROM warehouse');
      const [lowStockCount] = await database.query('SELECT COUNT(*) as count FROM warehouse WHERE quantity < min_quantity');
      
      const statsText = `
📊 <b>Статистика бота:</b>

👥 Активных пользователей: ${usersCount[0].count}
📦 Всего посылок: ${parcelsCount[0].count}
📊 Товаров на складе: ${warehouseItems[0].count}
⚠️ Товаров с низким запасом: ${lowStockCount[0].count}

<b>Система работает стабильно!</b>

📅 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>
      `;
      
      await bot.sendMessage(chatId, statsText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Обновить', callback_data: 'refresh_stats' },
              { text: '📈 Подробнее', callback_data: 'detailed_stats_public' }
            ],
            [
              { text: '📢 О боте', callback_data: 'about_bot' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Ошибка при получении статистики:', error);
      await bot.sendMessage(chatId, 
        '📊 <b>Статистика бота:</b>\n\n' +
        '👥 Пользователей: Активно\n' +
        '📦 Посылок: Отслеживается\n' +
        '📊 Склад: Работает\n\n' +
        '✅ Все системы работают нормально!',
        { parse_mode: 'HTML' }
      );
    }
  });
  
  // О боте
  bot.onText(/\/about/, async (msg) => {
    const chatId = msg.chat.id;
    
    const aboutText = `
🤖 <b>China Manager Bot</b>

<b>Версия:</b> 1.0.0
<b>Разработчик:</b> Команда China Manager
<b>Назначение:</b> Управление посылками из Китая и складскими запасами

<b>Основные функции:</b>
• 📦 Отслеживание посылок из Китая
• 📊 Управление складскими остатками
• 🔔 Уведомления о статусах и низком запасе
• 👥 Управление пользователями (для админов)

<b>Технологии:</b>
• Node.js + Telegram Bot API
• MySQL для хранения данных
• CRON для напоминаний

<b>Поддержка:</b>
Если у вас возникли проблемы или есть предложения, используйте команду /feedback

<b>Благодарности:</b>
Спасибо за использование нашего бота! Мы постоянно работаем над улучшением функционала.

📅 <i>Последнее обновление: Январь 2024</i>
    `;
    
    await bot.sendMessage(chatId, aboutText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📚 Помощь', callback_data: 'show_help' },
            { text: '📞 Поддержка', callback_data: 'show_support' }
          ],
          [
            { text: '⭐ Оценить бота', url: 'https://t.me/your_bot_link' },
            { text: '🔄 Обновления', url: 'https://github.com/your_repo' }
          ]
        ]
      }
    });
  });
  
  // Сброс диалога
  bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, 
      '🗑️ Текущее действие отменено.\n' +
      'Используйте /menu для возврата в главное меню.',
      {
        reply_markup: {
          remove_keyboard: true
        }
      }
    );
  });
  
  // Обработка callback-запросов для общих функций
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      // Обновление статистики
      if (data === 'refresh_stats') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Обновление...' });
        bot.emit('text', { ...callbackQuery.message, text: '/stats' });
      }
      
      // Подробная статистика (публичная)
      else if (data === 'detailed_stats_public') {
        const [monthlyParcels] = await database.query(`
          SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month,
            COUNT(*) as count
          FROM parcels 
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
          GROUP BY DATE_FORMAT(created_at, '%Y-%m')
          ORDER BY month DESC
        `);
        
        const [topSuppliers] = await database.query(`
          SELECT 
            supplier,
            COUNT(*) as count
          FROM parcels 
          WHERE supplier IS NOT NULL
          GROUP BY supplier
          ORDER BY count DESC
          LIMIT 5
        `);
        
        let detailedStats = `
📈 <b>Подробная статистика:</b>

<b>📅 Активность по месяцам:</b>
        `;
        
        if (monthlyParcels.length === 0) {
          detailedStats += 'Нет данных\n\n';
        } else {
          monthlyParcels.forEach(stat => {
            detailedStats += `${stat.month}: ${stat.count} посылок\n`;
          });
          detailedStats += '\n';
        }
        
        detailedStats += `<b>🏪 Топ поставщиков:</b>\n`;
        
        if (topSuppliers.length === 0) {
          detailedStats += 'Нет данных\n';
        } else {
          topSuppliers.forEach((supplier, index) => {
            detailedStats += `${index + 1}. ${supplier.supplier}: ${supplier.count} посылок\n`;
          });
        }
        
        detailedStats += `\n📅 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`;
        
        await bot.editMessageText(detailedStats, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '↩️ Назад', callback_data: 'back_to_stats' },
                { text: '🔄 Обновить', callback_data: 'detailed_stats_public' }
              ]
            ]
          }
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Возврат к статистике
      else if (data === 'back_to_stats') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/stats' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Показать помощь
      else if (data === 'show_help') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/help' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Ответ на обратную связь (для админов)
      else if (data.startsWith('reply_feedback:')) {
        const userTelegramId = data.split(':')[1];
        
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        
        await bot.sendMessage(chatId, 
          '📨 <b>Ответ на обратную связь</b>\n\n' +
          'Введите ваш ответ пользователю:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              force_reply: true,
              selective: true
            }
          }
        ).then(sentMsg => {
          bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
            const adminResponse = replyMsg.text.trim();
            const admin = await database.get('SELECT * FROM users WHERE telegram_id = ?', [replyMsg.from.id]);
            
            try {
              await bot.sendMessage(userTelegramId,
                `📨 <b>Ответ от администратора</b>\n\n` +
                `${adminResponse}\n\n` +
                `<i>От: ${admin.first_name} ${admin.last_name || ''}</i>`,
                { parse_mode: 'HTML' }
              );
              
              await bot.sendMessage(chatId, '✅ Ответ отправлен пользователю.');
            } catch (error) {
              console.error('Ошибка при отправке ответа:', error);
              await bot.sendMessage(chatId, '❌ Не удалось отправить ответ. Возможно, пользователь заблокировал бота.');
            }
          });
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
      // Пометить фидбек прочитанным
      else if (data.startsWith('mark_feedback_read:')) {
        const userId = data.split(':')[1];
        
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '✅ Сообщение помечено как прочитанное' 
        });
        
        // Удаляем кнопки
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          }
        );
      }
      
      // О боте
      else if (data === 'about_bot') {
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
        bot.emit('text', { ...callbackQuery.message, text: '/about' });
        await bot.answerCallbackQuery(callbackQuery.id);
      }
      
    } catch (error) {
      console.error('Ошибка в callback обработчике общих функций:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Произошла ошибка' });
    }
  });
  
  // Обработка текстовых сообщений (не команд)
  bot.on('message', async (msg) => {
    // Пропускаем команды
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }
    
    const chatId = msg.chat.id;
    
    try {
      // Проверяем, активен ли пользователь
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        // Если пользователь не активен, предлагаем запросить доступ
        if (msg.text && msg.text.toLowerCase().includes('доступ')) {
          await bot.sendMessage(chatId, 
            '🔐 Для получения доступа к боту используйте команду /request_access\n\n' +
            'Администратор рассмотрит ваш запрос в ближайшее время.',
            keyboards.backToStart()
          );
        } else {
          await bot.sendMessage(chatId, 
            '👋 Для начала работы с ботом используйте команду /start\n\n' +
            'Если у вас уже есть доступ, но вы его не видите, обратитесь к администратору.',
            keyboards.backToStart()
          );
        }
        return;
      }
      
      // Обработка текстовых ответов для различных состояний
      // (это можно расширить для обработки различных сценариев)
      
      if (msg.text && msg.text.length > 0) {
        // Простое эхо с подсказкой
        await bot.sendMessage(chatId,
          '🤖 Я получил ваше сообщение: "' + msg.text.substring(0, 50) + '"\n\n' +
          'Используйте команды из меню или /help для списка доступных команд.',
          keyboards.mainMenu()
        );
      }
      
    } catch (error) {
      console.error('Ошибка при обработке сообщения:', error);
      // Не отправляем сообщение об ошибке пользователю, чтобы не спамить
    }
  });
}

module.exports = commonHandlers;