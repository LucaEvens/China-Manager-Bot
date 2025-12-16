const { Markup } = require('telegraf');
const User = require('../models/User');
const db = require('../database/connection');

module.exports = function setupParcelHandlers(bot) {
  // Добавление посылки
  bot.hears('➕ Добавить посылку', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен');
    }

    // Инициализируем сессию
    ctx.session = ctx.session || {};
    ctx.session.parcelData = {};
    ctx.session.parcelStep = 'tracking';

    await ctx.reply(
      '📝 Введите трек-номер посылки:',
      Markup.keyboard([['❌ Отмена']]).resize()
    );
  });

  // Обработка ввода данных посылки
  bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.parcelStep) return;
    
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) return;

    // Отмена
    if (ctx.message.text === '❌ Отмена') {
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
      
      return ctx.reply(
        '❌ Добавление посылки отменено',
        Markup.keyboard([
          ['📦 Мои посылки', '➕ Добавить посылку'],
          ['🏪 Склад', '🔔 Напоминания']
        ]).resize()
      );
    }

    const step = ctx.session.parcelStep;
    const parcelData = ctx.session.parcelData;

    switch (step) {
      case 'tracking':
        // Проверяем уникальность трек-номера
        const existing = await db.query(
          'SELECT id FROM parcels WHERE tracking_number = ?',
          [ctx.message.text]
        );
        
        if (existing.length > 0) {
          return ctx.reply('❌ Посылка с таким трек-номером уже существует. Введите другой:');
        }
        
        parcelData.tracking_number = ctx.message.text;
        ctx.session.parcelStep = 'description';
        
        await ctx.reply('📝 Введите описание посылки:');
        break;

      case 'description':
        parcelData.description = ctx.message.text;
        ctx.session.parcelStep = 'supplier';
        
        await ctx.reply('🏢 Введите название поставщика:');
        break;

      case 'supplier':
        parcelData.supplier = ctx.message.text;
        ctx.session.parcelStep = 'expected_date';
        
        await ctx.reply(
          '📅 Введите ожидаемую дату доставки (в формате ГГГГ-ММ-ДД):\n' +
          'Например: 2024-12-31\n' +
          'Или нажмите "Пропустить"',
          Markup.keyboard([['Пропустить']]).resize()
        );
        break;

      case 'expected_date':
        if (ctx.message.text !== 'Пропустить') {
          // Проверяем формат даты
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(ctx.message.text)) {
            return ctx.reply('❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД:');
          }
          
          parcelData.expected_date = ctx.message.text;
        }
        ctx.session.parcelStep = 'notes';
        
        await ctx.reply(
          '🗒️ Введите заметки (опционально) или нажмите "Пропустить":',
          Markup.keyboard([['Пропустить']]).resize()
        );
        break;

      case 'notes':
        if (ctx.message.text !== 'Пропустить') {
          parcelData.notes = ctx.message.text;
        }
        
        // Сохраняем посылку в БД
        try {
          await db.execute(`
            INSERT INTO parcels 
            (tracking_number, description, supplier, expected_date, notes, user_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ordered')
          `, [
            parcelData.tracking_number,
            parcelData.description,
            parcelData.supplier,
            parcelData.expected_date || null,
            parcelData.notes || null,
            user.id
          ]);

          // Очищаем сессию
          delete ctx.session.parcelStep;
          delete ctx.session.parcelData;

          await ctx.reply(
            '✅ Посылка успешно добавлена!\n\n' +
            `Трек-номер: ${parcelData.tracking_number}\n` +
            `Описание: ${parcelData.description}\n` +
            `Поставщик: ${parcelData.supplier}`,
            Markup.keyboard([
              ['📦 Мои посылки', '➕ Добавить посылку'],
              ['🏪 Склад', '🔔 Напоминания']
            ]).resize()
          );
        } catch (error) {
          console.error('Ошибка сохранения посылки:', error);
          await ctx.reply('❌ Произошла ошибка при сохранении посылки');
        }
        break;
    }
  });

  // Обработка изменения статуса посылки
  bot.action(/^change_status_(\d+)$/, async (ctx) => {
    const parcelId = ctx.match[1];
    
    await ctx.reply('Выберите новый статус:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛒 Заказано', callback_data: `set_status_${parcelId}_ordered` },
            { text: '🚚 Отправлено', callback_data: `set_status_${parcelId}_shipped` }
          ],
          [
            { text: '✈️ В пути', callback_data: `set_status_${parcelId}_in_transit` },
            { text: '📦 Прибыло', callback_data: `set_status_${parcelId}_arrived` }
          ],
          [
            { text: '✅ Получено', callback_data: `set_status_${parcelId}_received` }
          ]
        ]
      }
    });
    
    await ctx.answerCbQuery();
  });

  // Установка статуса
  bot.action(/^set_status_(\d+)_(.+)$/, async (ctx) => {
    const [, parcelId, status] = ctx.match;
    
    try {
      await db.execute(
        'UPDATE parcels SET status = ? WHERE id = ?',
        [status, parcelId]
      );
      
      const statusText = {
        'ordered': '🛒 Заказано',
        'shipped': '🚚 Отправлено',
        'in_transit': '✈️ В пути',
        'arrived': '📦 Прибыло',
        'received': '✅ Получено'
      }[status] || status;
      
      await ctx.editMessageText(
        `✅ Статус посылки #${parcelId} изменен на: ${statusText}`
      );
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      await ctx.answerCbQuery('❌ Ошибка обновления');
    }
  });

  // Удаление посылки
  bot.action(/^delete_parcel_(\d+)$/, async (ctx) => {
    const parcelId = ctx.match[1];
    
    await ctx.reply(
      `❓ Вы уверены, что хотите удалить посылку #${parcelId}?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да, удалить', callback_data: `confirm_delete_${parcelId}` },
              { text: '❌ Нет, отмена', callback_data: 'cancel_delete' }
            ]
          ]
        }
      }
    );
    
    await ctx.answerCbQuery();
  });

  bot.action(/^confirm_delete_(\d+)$/, async (ctx) => {
    const parcelId = ctx.match[1];
    
    try {
      await db.execute('DELETE FROM parcels WHERE id = ?', [parcelId]);
      await ctx.editMessageText(`🗑️ Посылка #${parcelId} удалена`);
    } catch (error) {
      console.error('Ошибка удаления:', error);
      await ctx.editMessageText('❌ Ошибка при удалении');
    }
  });

  bot.action('cancel_delete', async (ctx) => {
    await ctx.editMessageText('❌ Удаление отменено');
  });
};