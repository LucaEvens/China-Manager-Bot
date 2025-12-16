const { Markup } = require('telegraf');
const User = require('../models/User');
const AccessRequest = require('../models/AccessRequest');
const config = require('../config');
const db = require('../database/connection');

let botInstance = null;

module.exports = function setupAdminHandlers(bot) {
  // Сохраняем экземпляр бота для использования в обработчиках
  botInstance = bot;

  // Проверка прав администратора
  function isAdmin(ctx) {
    return ctx.from.id === config.ADMIN_ID;
  }

  // Команда /requests
  bot.command('requests', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('⛔ У вас нет прав администратора');
    }

    try {
      const requests = await AccessRequest.getPending();
      
      if (requests.length === 0) {
        return ctx.reply('📭 Нет ожидающих запросов на доступ');
      }

      for (const request of requests) {
        const message = 
          `📋 Запрос #${request.id}\n\n` +
          `👤: ${request.first_name} ${request.last_name || ''}\n` +
          `📛: @${request.username || 'нет'}\n` +
          `🆔: ${request.telegram_id}\n` +
          `📅: ${new Date(request.created_at).toLocaleString('ru-RU')}`;
        
        await ctx.reply(message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Одобрить', callback_data: `approve_${request.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${request.id}` }
              ],
              [
                { text: '👁️ Просмотреть профиль', callback_data: `view_user_${request.user_id}` }
              ]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Ошибка в /requests:', error);
      ctx.reply('Произошла ошибка при загрузке запросов');
    }
  });

  // Команда /users
  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    try {
      const users = await User.getActiveUsers();
      
      if (users.length === 0) {
        return ctx.reply('👥 Нет активных пользователей');
      }
      
      let message = `👥 Активные пользователи (${users.length}):\n\n`;
      
      users.forEach((user, index) => {
        message += `${index + 1}. ${user.first_name} ${user.last_name || ''}\n`;
        message += `   @${user.username || 'нет'} | ID: ${user.telegram_id}\n`;
        message += `   📅 ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      await ctx.reply(message);
    } catch (error) {
      console.error('Ошибка в /users:', error);
      ctx.reply('Произошла ошибка');
    }
  });

  // Команда /stats
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    try {
      const [
        totalUsers,
        activeUsers,
        pendingRequests,
        totalParcels,
        warehouseStats
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM users'),
        db.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'),
        db.query("SELECT COUNT(*) as count FROM access_requests WHERE status = 'pending'"),
        db.query('SELECT COUNT(*) as count FROM parcels'),
        db.query('SELECT COUNT(*) as total, SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) as low FROM warehouse')
      ]);
      
      const stats = 
        `📊 СТАТИСТИКА СИСТЕМЫ\n\n` +
        `👥 Пользователи:\n` +
        `   • Всего: ${totalUsers[0].count}\n` +
        `   • Активных: ${activeUsers[0].count}\n` +
        `   • Ожидающих доступ: ${pendingRequests[0].count}\n\n` +
        `📦 Посылки:\n` +
        `   • Отслеживается: ${totalParcels[0].count}\n\n` +
        `🏪 Склад:\n` +
        `   • Товаров всего: ${warehouseStats[0].total || 0}\n` +
        `   • Мало на остатках: ${warehouseStats[0].low || 0}`;
      
      await ctx.reply(stats);
    } catch (error) {
      console.error('Ошибка в /stats:', error);
      ctx.reply('Произошла ошибка при получении статистики');
    }
  });

  // Обработка действий администратора
  bot.action(/^approve_(\d+)$/, async (ctx) => {
    await handleRequestDecision(ctx, 'approved');
  });

  bot.action(/^reject_(\d+)$/, async (ctx) => {
    await handleRequestDecision(ctx, 'rejected');
  });

  // Функция обработки решения по запросу
  async function handleRequestDecision(ctx, decision) {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery('⛔ Нет прав администратора');
    }

    const requestId = ctx.match[1];
    
    try {
      // Получаем информацию о запросе
      const request = await db.get(`
        SELECT ar.*, u.telegram_id, u.first_name
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        WHERE ar.id = ?
      `, [requestId]);

      if (!request) {
        return ctx.answerCbQuery('Запрос не найден');
      }

      // Обновляем статус запроса
      await AccessRequest.updateStatus(requestId, decision, ctx.from.id);
      
      if (decision === 'approved') {
        // Активируем пользователя
        await User.updateStatus(request.user_id, true);
        
        // Отправляем уведомление пользователю через botInstance
        if (botInstance) {
          try {
            await botInstance.telegram.sendMessage(
              request.telegram_id,
              `🎉 Поздравляем, ${request.first_name}!\n\n` +
              'Ваш запрос на доступ ОДОБРЕН!\n\n' +
              'Теперь вы можете пользоваться всеми функциями бота.\n' +
              'Нажмите /start для начала работы.',
              {
                reply_markup: {
                  keyboard: [
                    ['📦 Мои посылки', '➕ Добавить посылку'],
                    ['🏪 Склад', '🔔 Напоминания'],
                    ['📊 Статистика', '🆘 Помощь']
                  ],
                  resize_keyboard: true
                }
              }
            );
            
            console.log(`✅ Уведомление отправлено пользователю ${request.telegram_id}`);
          } catch (error) {
            console.error(`❌ Ошибка отправки пользователю ${request.telegram_id}:`, error.message);
          }
        } else {
          console.error('❌ botInstance не инициализирован');
        }
        
        await ctx.editMessageText(
          `✅ Запрос #${requestId} одобрен\n` +
          `Пользователь ${request.first_name} уведомлен`
        );
      } else {
        // Отправляем уведомление об отказе
        if (botInstance) {
          try {
            await botInstance.telegram.sendMessage(
              request.telegram_id,
              `❌ Ваш запрос на доступ отклонен администратором.`
            );
          } catch (error) {
            console.error(`❌ Ошибка отправки пользователю ${request.telegram_id}:`, error.message);
          }
        }
        
        await ctx.editMessageText(
          `❌ Запрос #${requestId} отклонен`
        );
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Ошибка обработки запроса:', error);
      ctx.answerCbQuery('Произошла ошибка');
    }
  }

  // Обработка callback "view_requests"
  bot.action('view_requests', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery('⛔ Нет прав');
    }
    
    await ctx.answerCbQuery();
    
    // Просто вызываем функцию команды /requests напрямую
    try {
      const requests = await AccessRequest.getPending();
      
      if (requests.length === 0) {
        await ctx.reply('📭 Нет ожидающих запросов на доступ');
        return;
      }

      for (const request of requests) {
        const message = 
          `📋 Запрос #${request.id}\n\n` +
          `👤: ${request.first_name} ${request.last_name || ''}\n` +
          `📛: @${request.username || 'нет'}\n` +
          `🆔: ${request.telegram_id}\n` +
          `📅: ${new Date(request.created_at).toLocaleString('ru-RU')}`;
        
        await ctx.reply(message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Одобрить', callback_data: `approve_${request.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${request.id}` }
              ],
              [
                { text: '👁️ Просмотреть профиль', callback_data: `view_user_${request.user_id}` }
              ]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Ошибка в view_requests callback:', error);
      await ctx.reply('Произошла ошибка при загрузке запросов');
    }
  });

  // Команда для рассылки
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    ctx.session = ctx.session || {};
    ctx.session.waitingForBroadcast = true;
    
    await ctx.reply(
      '📢 Введите сообщение для рассылки всем активным пользователям:'
    );
  });

  // Обработка сообщения для рассылки
  bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.waitingForBroadcast) return;
    if (!isAdmin(ctx)) return;
    
    const message = ctx.message.text;
    const users = await User.getActiveUsers();
    
    await ctx.reply(`📤 Начинаю рассылку для ${users.length} пользователей...`);
    
    let success = 0;
    let failed = 0;
    
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, 
          `📢 Сообщение от администратора:\n\n${message}`
        );
        success++;
        // Задержка чтобы не превысить лимиты Telegram
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Не удалось отправить пользователю ${user.telegram_id}:`, error.message);
        failed++;
      }
    }
    
    delete ctx.session.waitingForBroadcast;
    
    await ctx.reply(
      `📊 Результаты рассылки:\n` +
      `✅ Успешно: ${success}\n` +
      `❌ Не удалось: ${failed}`
    );
  });
};