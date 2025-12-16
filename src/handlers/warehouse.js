const { Markup } = require('telegraf');
const db = require('../database/connection');
const User = require('../models/User');

module.exports = function setupWarehouseHandlers(bot) {
  // Просмотр склада
  bot.hears('🏪 Склад', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен');
    }

    try {
      const items = await db.query(`
        SELECT * FROM warehouse 
        ORDER BY 
          CASE WHEN quantity <= min_quantity THEN 0 ELSE 1 END,
          quantity ASC
        LIMIT 20
      `);

      if (items.length === 0) {
        return ctx.reply('🏪 Склад пуст. Используйте "➕ Добавить товар"');
      }

      let message = '🏪 Товары на складе:\n\n';
      
      items.forEach((item, index) => {
        const status = item.quantity <= item.min_quantity ? '⚠️' : '✅';
        const stockStatus = item.quantity <= item.min_quantity ? 'МАЛО!' : 'норм';
        
        message += `${index + 1}. ${status} ${item.name}\n`;
        message += `   SKU: ${item.sku}\n`;
        message += `   Количество: ${item.quantity} (мин: ${item.min_quantity}) - ${stockStatus}\n`;
        if (item.location) {
          message += `   Место: ${item.location}\n`;
        }
        message += '\n';
      });

      const lowStockCount = items.filter(item => item.quantity <= item.min_quantity).length;
      if (lowStockCount > 0) {
        message += `\n⚠️ Внимание: ${lowStockCount} товаров с низким остатком!\n`;
        message += 'Рекомендуется пополнить запасы.';
      }

      await ctx.reply(message, {
        reply_markup: {
          keyboard: [
            ['➕ Добавить товар', '📝 Изменить количество'],
            ['🔍 Поиск товара', '📦 Мои посылки'],
            ['🔙 Назад']
          ],
          resize_keyboard: true
        }
      });

    } catch (error) {
      console.error('Ошибка при загрузке склада:', error);
      ctx.reply('Произошла ошибка при загрузке информации о складе');
    }
  });

  // Добавление товара
  bot.hears('➕ Добавить товар', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) return;

    ctx.session = ctx.session || {};
    ctx.session.warehouseData = {};
    ctx.session.warehouseStep = 'sku';

    await ctx.reply('Введите SKU (артикул) товара:', {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    });
  });

  // Поиск товара
  bot.hears('🔍 Поиск товара', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) return;

    ctx.session = ctx.session || {};
    ctx.session.searchStep = true;

    await ctx.reply('Введите SKU или название товара для поиска:', {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    });
  });

  // Изменение количества
  bot.hears('📝 Изменить количество', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) return;

    ctx.session = ctx.session || {};
    ctx.session.editQuantityStep = true;

    await ctx.reply('Введите SKU товара, количество которого нужно изменить:', {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    });
  });

  // Обработка текстовых сообщений для склада
  bot.on('text', async (ctx) => {
    if (!ctx.session) return;
    
    const user = await User.findByTelegramId(ctx.from.id);
    if (!user || !user.is_active) return;

    // Отмена
    if (ctx.message.text === '❌ Отмена') {
      delete ctx.session.warehouseStep;
      delete ctx.session.warehouseData;
      delete ctx.session.searchStep;
      delete ctx.session.editQuantityStep;
      delete ctx.session.editSku;
      
      return ctx.reply('Операция отменена', {
        reply_markup: {
          keyboard: [
            ['🏪 Склад', '📦 Мои посылки'],
            ['➕ Добавить посылку', '🔔 Напоминания']
          ],
          resize_keyboard: true
        }
      });
    }

    // Добавление товара
    if (ctx.session.warehouseStep) {
      const step = ctx.session.warehouseStep;
      const data = ctx.session.warehouseData;

      switch (step) {
        case 'sku':
          // Проверяем уникальность SKU
          const existing = await db.query(
            'SELECT id FROM warehouse WHERE sku = ?',
            [ctx.message.text]
          );
          
          if (existing.length > 0) {
            return ctx.reply('❌ Товар с таким SKU уже существует. Введите другой SKU:');
          }
          
          data.sku = ctx.message.text;
          ctx.session.warehouseStep = 'name';
          await ctx.reply('Введите название товара:');
          break;

        case 'name':
          data.name = ctx.message.text;
          ctx.session.warehouseStep = 'quantity';
          await ctx.reply('Введите начальное количество товара:');
          break;

        case 'quantity':
          const quantity = parseInt(ctx.message.text);
          if (isNaN(quantity) || quantity < 0) {
            return ctx.reply('❌ Введите корректное число (больше или равно 0):');
          }
          
          data.quantity = quantity;
          ctx.session.warehouseStep = 'min_quantity';
          await ctx.reply('Введите минимальное количество для остатка:');
          break;

        case 'min_quantity':
          const minQuantity = parseInt(ctx.message.text);
          if (isNaN(minQuantity) || minQuantity < 0) {
            return ctx.reply('❌ Введите корректное число (больше или равно 0):');
          }
          
          data.min_quantity = minQuantity;
          ctx.session.warehouseStep = 'location';
          await ctx.reply('Введите место хранения (или "Пропустить"):', {
            reply_markup: {
              keyboard: [['Пропустить']],
              resize_keyboard: true
            }
          });
          break;

        case 'location':
          if (ctx.message.text !== 'Пропустить') {
            data.location = ctx.message.text;
          }
          
          // Сохраняем товар
          try {
            await db.execute(`
              INSERT INTO warehouse (sku, name, quantity, min_quantity, location)
              VALUES (?, ?, ?, ?, ?)
            `, [
              data.sku,
              data.name,
              data.quantity,
              data.min_quantity,
              data.location || null
            ]);

            delete ctx.session.warehouseStep;
            delete ctx.session.warehouseData;

            await ctx.reply(
              `✅ Товар добавлен на склад!\n\n` +
              `SKU: ${data.sku}\n` +
              `Название: ${data.name}\n` +
              `Количество: ${data.quantity}\n` +
              `Мин. остаток: ${data.min_quantity}\n` +
              `Место: ${data.location || 'не указано'}`,
              {
                reply_markup: {
                  keyboard: [
                    ['🏪 Склад', '📦 Мои посылки'],
                    ['➕ Добавить посылку', '🔔 Напоминания']
                  ],
                  resize_keyboard: true
                }
              }
            );
          } catch (error) {
            console.error('Ошибка сохранения товара:', error);
            await ctx.reply('❌ Ошибка при добавлении товара');
          }
          break;
      }
    }

    // Поиск товара
    else if (ctx.session.searchStep) {
      const searchTerm = ctx.message.text;
      
      try {
        const items = await db.query(`
          SELECT * FROM warehouse 
          WHERE sku LIKE ? OR name LIKE ?
          ORDER BY quantity ASC
          LIMIT 10
        `, [`%${searchTerm}%`, `%${searchTerm}%`]);

        if (items.length === 0) {
          await ctx.reply('❌ Товары не найдены');
        } else {
          let message = `🔍 Результаты поиска "${searchTerm}":\n\n`;
          
          items.forEach((item, index) => {
            const status = item.quantity <= item.min_quantity ? '⚠️' : '✅';
            message += `${index + 1}. ${status} ${item.name}\n`;
            message += `   SKU: ${item.sku}\n`;
            message += `   Количество: ${item.quantity}\n`;
            if (item.location) {
              message += `   Место: ${item.location}\n`;
            }
            message += '\n';
          });

          await ctx.reply(message);
        }
      } catch (error) {
        console.error('Ошибка поиска:', error);
        await ctx.reply('❌ Ошибка при поиске товара');
      }

      delete ctx.session.searchStep;
    }

    // Изменение количества
    else if (ctx.session.editQuantityStep) {
      if (!ctx.session.editSku) {
        // Получаем SKU для редактирования
        const sku = ctx.message.text;
        const item = await db.get('SELECT * FROM warehouse WHERE sku = ?', [sku]);
        
        if (!item) {
          await ctx.reply('❌ Товар с таким SKU не найден');
          delete ctx.session.editQuantityStep;
          return;
        }

        ctx.session.editSku = sku;
        ctx.session.currentItem = item;
        
        await ctx.reply(
          `Товар: ${item.name}\n` +
          `Текущее количество: ${item.quantity}\n\n` +
          'Введите новое количество:'
        );
      } else {
        // Получаем новое количество
        const newQuantity = parseInt(ctx.message.text);
        if (isNaN(newQuantity) || newQuantity < 0) {
          await ctx.reply('❌ Введите корректное число (больше или равно 0):');
          return;
        }

        try {
          await db.execute(
            'UPDATE warehouse SET quantity = ? WHERE sku = ?',
            [newQuantity, ctx.session.editSku]
          );

          await ctx.reply(
            `✅ Количество товара обновлено!\n` +
            `Товар: ${ctx.session.currentItem.name}\n` +
            `Новое количество: ${newQuantity}`
          );
        } catch (error) {
          console.error('Ошибка обновления:', error);
          await ctx.reply('❌ Ошибка при обновлении количества');
        }

        delete ctx.session.editQuantityStep;
        delete ctx.session.editSku;
        delete ctx.session.currentItem;
      }
    }
  });
};