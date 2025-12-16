const { Markup } = require('telegraf');
const User = require('../models/User');
const AccessRequest = require('../models/AccessRequest');
const config = require('../config');
const db = require('../database/connection');

module.exports = function setupAuthHandlers(bot) {
  // Обработчик команды /start
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      // Проверяем существование пользователя
      let user = await User.findByTelegramId(userId);
      
      if (!user) {
        // Создаем нового пользователя с безопасными данными
        const userData = {
          telegram_id: userId,
          username: ctx.from.username || null,  // ← ИСПРАВЛЕНО
          first_name: ctx.from.first_name || 'Пользователь',
          last_name: ctx.from.last_name || null // ← ИСПРАВЛЕНО
        };
        
        user = await User.create(userData);
        
        await ctx.reply(
          '👋 Добро пожаловать!\n\n' +
          'Для доступа к функциям бота отправьте команду /zapros\n\n' +
          'После одобрения администратора вы сможете:\n' +
          '• Отслеживать посылки из Китая\n' +
          '• Управлять складом\n' +
          '• Получать напоминания'
        );
      } else if (user.is_active) {
        // Пользователь активен - показываем меню
        await ctx.reply(
          `✅ С возвращением, ${user.first_name}!\n\n` +
          'Используйте меню ниже для работы с ботом:',
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
      } else {
        // Пользователь не активен
        await ctx.reply(
          '⏳ Ваш запрос на доступ еще не рассмотрен.\n' +
          'Ожидайте подтверждения от администратора.'
        );
      }
    } catch (error) {
      console.error('Ошибка в /start:', error.message);
      await ctx.reply('Произошла ошибка при регистрации. Попробуйте позже.');
    }
  });

  // Команда /zapros
  bot.command('zapros', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      // Проверяем пользователя
      let user = await User.findByTelegramId(userId);
      
      if (!user) {
        // Создаем пользователя с безопасными данными
        const userData = {
          telegram_id: userId,
          username: ctx.from.username || null,  // ← ИСПРАВЛЕНО
          first_name: ctx.from.first_name || 'Пользователь',
          last_name: ctx.from.last_name || null // ← ИСПРАВЛЕНО
        };
        
        user = await User.create(userData);
      }
      
      // Проверяем активный запрос
      const existingRequest = await AccessRequest.findByUser(user.id);
      
      if (existingRequest) {
        await ctx.reply(
          '📨 Ваш запрос уже отправлен и ожидает рассмотрения.'
        );
        return;
      }
      
      // Создаем новый запрос
      await AccessRequest.create(user.id);
      
      // Отправляем уведомление админу
      await sendAdminNotification(ctx, user);
      
      await ctx.reply(
        '✅ Запрос на доступ успешно отправлен!\n\n' +
        'Администратор получил уведомление и скоро рассмотрит вашу заявку.\n' +
        'Вы получите сообщение когда доступ будет предоставлен.'
      );
      
    } catch (error) {
      console.error('Ошибка в /zapros:', error.message);
      await ctx.reply('Произошла ошибка при отправке запроса.');
    }
  });

  // Функция отправки уведомления админу
  async function sendAdminNotification(ctx, user) {
    try {
      if (!config.ADMIN_ID) {
        console.warn('⚠️ ADMIN_ID не установлен в .env');
        return;
      }
      
      const message = 
        `📨 НОВЫЙ ЗАПРОС НА ДОСТУП!\n\n` +
        `👤 Пользователь: ${user.first_name} ${user.last_name || ''}\n` +
        `📛 ${user.username ? '@' + user.username : 'без username'}\n` +
        `🆔 ID: ${user.telegram_id}\n` +
        `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
        `Для обработки используйте /requests`;
      
      // Используем глобальный экземпляр бота если доступен
      if (global.botInstance) {
        await global.botInstance.telegram.sendMessage(config.ADMIN_ID, message, {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📋 Просмотреть запросы',
                callback_data: 'view_requests'
              }
            ]]
          }
        });
      } else {
        // Или используем ctx.telegram (работает только в обработчиках сообщений)
        await ctx.telegram.sendMessage(config.ADMIN_ID, message, {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📋 Просмотреть запросы',
                callback_data: 'view_requests'
              }
            ]]
          }
        });
      }
      
      console.log(`✅ Уведомление отправлено администратору ${config.ADMIN_ID}`);
      
    } catch (error) {
      console.error('Ошибка отправки админу:', error.message);
    }
  }
};