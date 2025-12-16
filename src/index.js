require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const config = require('./config');

const bot = new Telegraf(config.BOT_TOKEN);
bot.use(session());

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let db, User, AccessRequest;

// ========== ИНИЦИАЛИЗАЦИЯ МОДУЛЕЙ ==========

async function initModules() {
  try {
    db = require('./database/connection');
    User = require('./models/User');
    AccessRequest = require('./models/AccessRequest');
    console.log('✅ Модули загружены');
  } catch (error) {
    console.error('❌ Ошибка загрузки модулей:', error);
    process.exit(1);
  }
}

// ========== ФУНКЦИИ ОБРАБОТКИ ==========

async function handleStart(ctx) {
  console.log(`>>> /start от ${ctx.from.id}`);
  
  try {
    let user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
      const userData = {
        telegram_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || 'Пользователь',
        last_name: ctx.from.last_name || null
      };
      user = await User.create(userData);
    }
    
    const message = user.is_active 
      ? `✅ Добро пожаловать, ${user.first_name}!`
      : `👋 Привет, ${user.first_name}! Отправьте /zapros для доступа.`;
    
    await ctx.reply(message, {
      reply_markup: {
        keyboard: [
          ['📦 Все посылки', '➕ Добавить посылку'],
          ['🏪 Склад', '✏️ Редактировать склад'],
          ['📊 Статистика', '🆘 Помощь']
        ],
        resize_keyboard: true
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleStart:', error);
    await ctx.reply('Ошибка при запуске. Попробуйте снова.');
  }
}

async function handleZapros(ctx) {
  console.log(`>>> /zapros от ${ctx.from.id}`);
  
  try {
    let user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
      const userData = {
        telegram_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || 'Пользователь',
        last_name: ctx.from.last_name || null
      };
      user = await User.create(userData);
    }
    
    const existingRequest = await AccessRequest.findByUser(user.id);
    
    if (existingRequest) {
      await ctx.reply('📨 Ваш запрос уже отправлен и ожидает рассмотрения администратором.');
      return;
    }
    
    await AccessRequest.create(user.id);
    
    // Уведомление админу
    if (config.ADMIN_ID) {
      try {
        const adminMessage = 
          `📨 НОВЫЙ ЗАПРОС НА ДОСТУП!\n\n` +
          `👤 Пользователь: ${user.first_name} ${user.last_name || ''}\n` +
          `📛 ${user.username ? '@' + user.username : 'без username'}\n` +
          `🆔 ID: ${user.telegram_id}\n` +
          `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `Для обработки используйте /requests`;
        
        await bot.telegram.sendMessage(config.ADMIN_ID, adminMessage, {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 Просмотреть запросы', callback_data: 'view_requests' }
            ]]
          }
        });
        
        console.log(`✅ Уведомление отправлено администратору ${config.ADMIN_ID}`);
        
      } catch (error) {
        console.error('Ошибка отправки уведомления админу:', error.message);
      }
    }
    
    await ctx.reply(
      '✅ Запрос на доступ успешно отправлен!\n\n' +
      'Администратор получил уведомление и скоро рассмотрит вашу заявку.\n' +
      'Вы получите сообщение когда доступ будет предоставлен.'
    );
    
  } catch (error) {
    console.error('Ошибка в handleZapros:', error);
    await ctx.reply('❌ Произошла ошибка при отправке запроса.');
  }
}

async function handleAllParcels(ctx) {
  console.log(`>>> Все посылки от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros для получения доступа');
    }
    
    const parcels = await db.query(
      `SELECT p.*, u.first_name as user_name,
         CASE p.status
           WHEN 'ordered' THEN '🛒 Заказано'
           WHEN 'shipped' THEN '🚚 Отправлено'
           WHEN 'in_transit' THEN '✈️ В пути'
           WHEN 'arrived' THEN '📦 Прибыло'
           WHEN 'received' THEN '✅ Получено'
           ELSE p.status
         END as status_text
       FROM parcels p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT 20`
    );
    
    if (parcels.length === 0) {
      await ctx.reply('📭 Нет посылок в системе.');
      return;
    }
    
    let message = `📦 Все посылки (${parcels.length}):\n\n`;
    
    parcels.forEach((parcel, index) => {
      const userInfo = parcel.user_name ? `👤 ${parcel.user_name}` : '';
      const statusEmoji = {
        'ordered': '🛒',
        'shipped': '🚚',
        'in_transit': '✈️',
        'arrived': '📦',
        'received': '✅'
      }[parcel.status] || '📦';
      
      message += `${index + 1}. ${statusEmoji} ${parcel.tracking_number}\n`;
      if (parcel.description) {
        message += `   ${parcel.description}\n`;
      }
      message += `   Статус: ${parcel.status_text}\n`;
      if (parcel.supplier) {
        message += `   Поставщик: ${parcel.supplier}\n`;
      }
      if (parcel.expected_date) {
        message += `   Ожидается: ${parcel.expected_date}\n`;
      }
      if (userInfo) {
        message += `   ${userInfo}\n`;
      }
      message += '\n';
    });
    
    const inlineKeyboard = [
      [
        { text: '✏️ Изменить статус', callback_data: 'change_parcel_status' },
        { text: '🗑️ Удалить посылку', callback_data: 'delete_parcel_select' }
      ],
      [
        { text: '🔄 Обновить список', callback_data: 'refresh_parcels' }
      ]
    ];
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleAllParcels:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке посылок');
  }
}

async function handleAddParcel(ctx) {
  console.log(`>>> Добавить посылку от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros для получения доступа');
    }
    
    ctx.session = ctx.session || {};
    ctx.session.parcelStep = 'tracking';
    ctx.session.parcelData = {};
    
    await ctx.reply('📦 Введите трек-номер посылки:', {
      reply_markup: {
        keyboard: [['❌ Отмена']],
        resize_keyboard: true
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleAddParcel:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

async function handleWarehouse(ctx) {
  console.log(`>>> Склад от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros');
    }
    
    const items = await db.query(
      `SELECT * FROM warehouse 
       ORDER BY 
         CASE WHEN quantity <= min_quantity THEN 0 ELSE 1 END,
         quantity ASC
       LIMIT 20`
    );
    
    if (items.length === 0) {
      await ctx.reply('🏪 Склад пуст');
      return;
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
    
    const lowStock = items.filter(item => item.quantity <= item.min_quantity).length;
    if (lowStock > 0) {
      message += `\n⚠️ Внимание: ${lowStock} товаров с низким остатком!`;
    }
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✏️ Редактировать остатки', callback_data: 'edit_warehouse' }
        ]]
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleWarehouse:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке склада');
  }
}

async function handleEditWarehouse(ctx) {
  console.log(`>>> Редактировать склад от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен.');
    }
    
    const items = await db.query(
      'SELECT * FROM warehouse ORDER BY name ASC LIMIT 20'
    );
    
    if (items.length === 0) {
      await ctx.reply('🏪 Склад пуст. Нечего редактировать.');
      return;
    }
    
    let message = '🏪 Выберите товар для редактирования:\n\n';
    
    items.forEach((item, index) => {
      const status = item.quantity <= item.min_quantity ? '⚠️' : '✅';
      message += `${index + 1}. ${status} ${item.name}\n`;
      message += `   SKU: ${item.sku}\n`;
      message += `   Количество: ${item.quantity}\n`;
      message += `   Мин. остаток: ${item.min_quantity}\n\n`;
    });
    
    const inlineKeyboard = items.map(item => [
      {
        text: `${item.sku} - ${item.name}`,
        callback_data: `edit_item_${item.id}`
      }
    ]);
    
    // Добавляем кнопку "Добавить новый товар"
    inlineKeyboard.push([
      { text: '➕ Добавить новый товар', callback_data: 'add_new_item' }
    ]);
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleEditWarehouse:', error);
    await ctx.reply('❌ Ошибка загрузки склада');
  }
}

async function handleEditItem(ctx, itemId) {
  console.log(`>>> Редактирование товара ${itemId} от ${ctx.from.id}`);
  
  try {
    const [item] = await db.query(
      'SELECT * FROM warehouse WHERE id = ?',
      [itemId]
    );
    
    if (!item) {
      await ctx.reply('❌ Товар не найден');
      return;
    }
    
    const message = 
      `🏪 Редактирование товара:\n\n` +
      `Название: ${item.name}\n` +
      `SKU: ${item.sku}\n` +
      `Текущее количество: ${item.quantity}\n` +
      `Мин. остаток: ${item.min_quantity}\n` +
      `Место: ${item.location || 'не указано'}\n\n` +
      `Выберите что изменить:`;
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Изменить количество', callback_data: `edit_qty_${itemId}` },
            { text: '⚙️ Изменить мин. остаток', callback_data: `edit_min_${itemId}` }
          ],
          [
            { text: '📍 Изменить место', callback_data: `edit_loc_${itemId}` },
            { text: '🗑️ Удалить товар', callback_data: `delete_item_${itemId}` }
          ],
          [
            { text: '🔙 Назад к складу', callback_data: 'back_to_warehouse' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleEditItem:', error);
    await ctx.reply('❌ Ошибка загрузки товара');
  }
}

async function handleStatistics(ctx) {
  console.log(`>>> Статистика от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros');
    }
    
    const [parcelsCount] = await db.query('SELECT COUNT(*) as count FROM parcels');
    const [remindersCount] = await db.query(
      'SELECT COUNT(*) as count FROM reminders WHERE is_sent = FALSE'
    );
    const [warehouseStats] = await db.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) as low FROM warehouse'
    );
    
    const message = 
      `📊 Статистика системы:\n\n` +
      `📦 Посылки:\n` +
      `   • Всего: ${parcelsCount.count}\n\n` +
      `🔔 Напоминания:\n` +
      `   • Активных: ${remindersCount.count}\n\n` +
      `🏪 Склад:\n` +
      `   • Товаров всего: ${warehouseStats.total || 0}\n` +
      `   • С низким остатком: ${warehouseStats.low || 0}`;
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Ошибка в handleStatistics:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

async function handleHelp(ctx) {
  console.log(`>>> Помощь от ${ctx.from.id}`);
  
  const message = 
    `🆘 Помощь:\n\n` +
    `/start - Начать работу / меню\n` +
    `/zapros - Запросить доступ\n` +
    `/help - Эта справка\n\n` +
    `📦 *Все посылки* - просмотр всех посылок в системе\n` +
    `➕ *Добавить посылку* - добавить новую посылку\n` +
    `🏪 *Склад* - просмотр товаров на складе\n` +
    `✏️ *Редактировать склад* - изменение остатков товаров\n` +
    `📊 *Статистика* - статистика системы\n\n` +
    `Для удаления посылок и редактирования статусов используйте кнопки в меню посылок.`;
  
  await ctx.reply(message);
}

async function handleParcelInput(ctx) {
  const text = ctx.message.text;
  const step = ctx.session.parcelStep;
  const data = ctx.session.parcelData || {};
  
  console.log(`>>> Ввод посылки [${step}]: "${text}"`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
      return;
    }
    
    switch (step) {
      case 'tracking':
        const existing = await db.query(
          'SELECT id FROM parcels WHERE tracking_number = ?',
          [text]
        );
        
        if (existing.length > 0) {
          await ctx.reply('❌ Посылка с таким трек-номером уже существует. Введите другой:');
          return;
        }
        
        data.tracking_number = text;
        ctx.session.parcelStep = 'description';
        ctx.session.parcelData = data;
        
        await ctx.reply('📝 Введите описание посылки:', {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        });
        break;
        
      case 'description':
        data.description = text;
        ctx.session.parcelStep = 'supplier';
        ctx.session.parcelData = data;
        
        await ctx.reply('🏢 Введите поставщика:', {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        });
        break;
        
      case 'supplier':
        data.supplier = text;
        
        await db.execute(
          'INSERT INTO parcels (tracking_number, description, supplier, user_id, status) VALUES (?, ?, ?, ?, "ordered")',
          [data.tracking_number, data.description, data.supplier, user.id]
        );
        
        delete ctx.session.parcelStep;
        delete ctx.session.parcelData;
        
        await ctx.reply(`✅ Посылка ${data.tracking_number} добавлена!`, {
          reply_markup: {
            keyboard: [
              ['📦 Все посылки', '➕ Добавить посылку'],
              ['🏪 Склад', '✏️ Редактировать склад'],
              ['📊 Статистика', '🆘 Помощь']
            ],
            resize_keyboard: true
          }
        });
        break;
    }
  } catch (error) {
    console.error('Ошибка добавления посылки:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
    delete ctx.session?.parcelStep;
    delete ctx.session?.parcelData;
  }
}

async function handleWarehouseInput(ctx) {
  const text = ctx.message.text;
  const step = ctx.session.warehouseStep;
  const data = ctx.session.warehouseData || {};
  const itemId = ctx.session.editingItemId;
  
  console.log(`>>> Ввод склада [${step}]: "${text}"`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      delete ctx.session.warehouseStep;
      delete ctx.session.warehouseData;
      delete ctx.session.editingItemId;
      return;
    }
    
    switch (step) {
      case 'edit_quantity':
        const quantity = parseInt(text);
        if (isNaN(quantity) || quantity < 0) {
          await ctx.reply('❌ Введите корректное число (больше или равно 0):');
          return;
        }
        
        await db.execute(
          'UPDATE warehouse SET quantity = ? WHERE id = ?',
          [quantity, itemId]
        );
        
        delete ctx.session.warehouseStep;
        delete ctx.session.warehouseData;
        delete ctx.session.editingItemId;
        
        await ctx.reply(`✅ Количество обновлено! Новое количество: ${quantity}`, {
          reply_markup: {
            keyboard: [
              ['📦 Все посылки', '➕ Добавить посылку'],
              ['🏪 Склад', '✏️ Редактировать склад'],
              ['📊 Статистика', '🆘 Помощь']
            ],
            resize_keyboard: true
          }
        });
        break;
        
      case 'edit_min_quantity':
        const minQuantity = parseInt(text);
        if (isNaN(minQuantity) || minQuantity < 0) {
          await ctx.reply('❌ Введите корректное число (больше или равно 0):');
          return;
        }
        
        await db.execute(
          'UPDATE warehouse SET min_quantity = ? WHERE id = ?',
          [minQuantity, itemId]
        );
        
        delete ctx.session.warehouseStep;
        delete ctx.session.warehouseData;
        delete ctx.session.editingItemId;
        
        await ctx.reply(`✅ Мин. остаток обновлен! Новый минимум: ${minQuantity}`, {
          reply_markup: {
            keyboard: [
              ['📦 Все посылки', '➕ Добавить посылку'],
              ['🏪 Склад', '✏️ Редактировать склад'],
              ['📊 Статистика', '🆘 Помощь']
            ],
            resize_keyboard: true
          }
        });
        break;
        
      case 'edit_location':
        await db.execute(
          'UPDATE warehouse SET location = ? WHERE id = ?',
          [text, itemId]
        );
        
        delete ctx.session.warehouseStep;
        delete ctx.session.warehouseData;
        delete ctx.session.editingItemId;
        
        await ctx.reply(`✅ Место хранения обновлено! Новое место: ${text}`, {
          reply_markup: {
            keyboard: [
              ['📦 Все посылки', '➕ Добавить посылку'],
              ['🏪 Склад', '✏️ Редактировать склад'],
              ['📊 Статистика', '🆘 Помощь']
            ],
            resize_keyboard: true
          }
        });
        break;
    }
  } catch (error) {
    console.error('Ошибка редактирования склада:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
    delete ctx.session?.warehouseStep;
    delete ctx.session?.warehouseData;
    delete ctx.session?.editingItemId;
  }
}

// ========== ФУНКЦИИ ДЛЯ УДАЛЕНИЯ ПОСЫЛОК ==========

async function handleDeleteParcelSelect(ctx) {
  console.log(`>>> Выбор посылки для удаления от ${ctx.from.id}`);
  
  try {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return;
    }
    
    const parcels = await db.query(
      `SELECT p.id, p.tracking_number, p.description, p.status, u.first_name
       FROM parcels p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT 15`
    );
    
    if (parcels.length === 0) {
      await ctx.reply('📭 Нет посылок для удаления');
      return;
    }
    
    let message = '🗑️ Выберите посылку для удаления:\n\n';
    
    parcels.forEach((parcel, index) => {
      const statusEmoji = {
        'ordered': '🛒',
        'shipped': '🚚',
        'in_transit': '✈️',
        'arrived': '📦',
        'received': '✅'
      }[parcel.status] || '📦';
      
      message += `${index + 1}. ${statusEmoji} ${parcel.tracking_number}\n`;
      if (parcel.description) {
        message += `   ${parcel.description}\n`;
      }
      message += `   Добавил: ${parcel.first_name || 'неизвестно'}\n\n`;
    });
    
    const inlineKeyboard = parcels.map(parcel => [
      {
        text: `${parcel.tracking_number}`,
        callback_data: `confirm_delete_parcel_${parcel.id}`
      }
    ]);
    
    inlineKeyboard.push([
      { text: '🔙 Назад', callback_data: 'back_to_parcels' }
    ]);
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleDeleteParcelSelect:', error);
    await ctx.reply('❌ Ошибка загрузки посылок');
  }
}

async function handleConfirmDeleteParcel(ctx, parcelId) {
  console.log(`>>> Подтверждение удаления посылки ${parcelId} от ${ctx.from.id}`);
  
  try {
    const [parcel] = await db.query(
      `SELECT p.*, u.first_name 
       FROM parcels p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [parcelId]
    );
    
    if (!parcel) {
      await ctx.reply('❌ Посылка не найдена');
      return;
    }
    
    const message = 
      `🗑️ Подтвердите удаление посылки:\n\n` +
      `📦 Трек-номер: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'нет'}\n` +
      `🏢 Поставщик: ${parcel.supplier || 'нет'}\n` +
      `📊 Статус: ${parcel.status}\n` +
      `👤 Добавил: ${parcel.first_name || 'неизвестно'}\n\n` +
      `Вы уверены, что хотите удалить эту посылку?`;
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да, удалить', callback_data: `delete_parcel_${parcelId}` },
            { text: '❌ Нет, отмена', callback_data: 'cancel_delete_parcel' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleConfirmDeleteParcel:', error);
    await ctx.reply('❌ Ошибка загрузки посылки');
  }
}

async function handleDeleteParcel(ctx, parcelId) {
  console.log(`>>> Удаление посылки ${parcelId} от ${ctx.from.id}`);
  
  try {
    const [parcel] = await db.query(
      'SELECT tracking_number FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    if (!parcel) {
      await ctx.reply('❌ Посылка не найдена');
      return;
    }
    
    await db.execute('DELETE FROM parcels WHERE id = ?', [parcelId]);
    
    await ctx.reply(`✅ Посылка ${parcel.tracking_number} удалена!`);
    
    // Показываем обновленный список посылок
    await handleAllParcels(ctx);
    
  } catch (error) {
    console.error('Ошибка удаления посылки:', error);
    await ctx.reply('❌ Ошибка удаления посылки');
  }
}

// ========== ФУНКЦИИ ДЛЯ ИЗМЕНЕНИЯ СТАТУСА ==========

async function handleChangeParcelStatus(ctx) {
  console.log(`>>> Изменение статуса посылки от ${ctx.from.id}`);
  
  try {
    const parcels = await db.query(
      `SELECT p.id, p.tracking_number, p.description, p.status
       FROM parcels p
       ORDER BY p.created_at DESC
       LIMIT 15`
    );
    
    if (parcels.length === 0) {
      await ctx.reply('📭 Нет посылок для изменения статуса');
      return;
    }
    
    let message = '✏️ Выберите посылку для изменения статуса:\n\n';
    
    parcels.forEach((parcel, index) => {
      const statusEmoji = {
        'ordered': '🛒',
        'shipped': '🚚',
        'in_transit': '✈️',
        'arrived': '📦',
        'received': '✅'
      }[parcel.status] || '📦';
      
      message += `${index + 1}. ${statusEmoji} ${parcel.tracking_number}\n`;
      if (parcel.description) {
        message += `   ${parcel.description}\n`;
      }
      message += `   Текущий статус: ${parcel.status}\n\n`;
    });
    
    const inlineKeyboard = parcels.map(parcel => [
      {
        text: `${parcel.tracking_number}`,
        callback_data: `select_parcel_status_${parcel.id}`
      }
    ]);
    
    inlineKeyboard.push([
      { text: '🔙 Назад', callback_data: 'back_to_parcels' }
    ]);
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleChangeParcelStatus:', error);
    await ctx.reply('❌ Ошибка загрузки посылок');
  }
}

async function handleSelectParcelStatus(ctx, parcelId) {
  console.log(`>>> Выбор статуса для посылки ${parcelId} от ${ctx.from.id}`);
  
  try {
    const [parcel] = await db.query(
      'SELECT tracking_number, description, status FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    if (!parcel) {
      await ctx.reply('❌ Посылка не найдена');
      return;
    }
    
    const statusOptions = [
      { text: '🛒 Заказано', value: 'ordered' },
      { text: '🚚 Отправлено', value: 'shipped' },
      { text: '✈️ В пути', value: 'in_transit' },
      { text: '📦 Прибыло', value: 'arrived' },
      { text: '✅ Получено', value: 'received' }
    ];
    
    const currentStatus = parcel.status;
    const currentStatusText = statusOptions.find(s => s.value === currentStatus)?.text || currentStatus;
    
    const message = 
      `✏️ Изменение статуса посылки:\n\n` +
      `📦 Посылка: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'нет'}\n` +
      `📊 Текущий статус: ${currentStatusText}\n\n` +
      `Выберите новый статус:`;
    
    const inlineKeyboard = statusOptions.map(status => [
      {
        text: status.text,
        callback_data: `update_parcel_status_${parcelId}_${status.value}`
      }
    ]);
    
    inlineKeyboard.push([
      { text: '🔙 Назад к выбору посылки', callback_data: 'change_parcel_status' }
    ]);
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleSelectParcelStatus:', error);
    await ctx.reply('❌ Ошибка загрузки посылки');
  }
}

async function handleUpdateParcelStatus(ctx, parcelId, newStatus) {
  console.log(`>>> Обновление статуса ${parcelId} на ${newStatus} от ${ctx.from.id}`);
  
  try {
    const [parcel] = await db.query(
      'SELECT tracking_number, description, user_id FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    if (!parcel) {
      await ctx.reply('❌ Посылка не найдена');
      return;
    }
    
    await db.execute(
      'UPDATE parcels SET status = ? WHERE id = ?',
      [newStatus, parcelId]
    );
    
    const statusTexts = {
      'ordered': '🛒 Заказано',
      'shipped': '🚚 Отправлено',
      'in_transit': '✈️ В пути',
      'arrived': '📦 Прибыло',
      'received': '✅ Получено'
    };
    
    const statusText = statusTexts[newStatus] || newStatus;
    
    await ctx.reply(
      `✅ Статус посылки обновлен!\n\n` +
      `📦 Посылка: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'нет'}\n` +
      `🔄 Новый статус: ${statusText}`
    );
    
    // Уведомляем владельца посылки, если это не текущий пользователь
    if (parcel.user_id) {
      const [owner] = await db.query(
        'SELECT telegram_id, first_name FROM users WHERE id = ?',
        [parcel.user_id]
      );
      
      if (owner && owner.telegram_id !== ctx.from.id) {
        try {
          await bot.telegram.sendMessage(
            owner.telegram_id,
            `📦 Статус вашей посылки изменен!\n\n` +
            `🔢 Трек-номер: ${parcel.tracking_number}\n` +
            `📝 Описание: ${parcel.description || 'нет'}\n` +
            `🔄 Новый статус: ${statusText}\n` +
            `👤 Изменил: ${ctx.from.first_name}`
          );
        } catch (error) {
          console.error('Не удалось уведомить владельца:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    await ctx.reply('❌ Ошибка обновления статуса');
  }
}

// ========== АДМИНИСТРАТОРСКИЕ ФУНКЦИИ ==========

async function handleRequests(ctx) {
  if (ctx.from.id !== config.ADMIN_ID) {
    return ctx.reply('⛔ У вас нет прав администратора');
  }
  
  console.log('>>> /requests от админа');
  
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
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Ошибка в /requests:', error);
    ctx.reply('Произошла ошибка при загрузке запросов');
  }
}

// ========== ОБРАБОТКА КОМАНД И КНОПОК ==========

async function handleCommand(ctx, text) {
  console.log(`>>> Команда: ${text} от ${ctx.from.id}`);
  
  switch (text.toLowerCase()) {
    case '/start':
      await handleStart(ctx);
      break;
      
    case '/zapros':
      await handleZapros(ctx);
      break;
      
    case '/help':
      await handleHelp(ctx);
      break;
      
    case '/requests':
      await handleRequests(ctx);
      break;
      
    default:
      await ctx.reply(`Неизвестная команда: ${text}. Используйте /help`);
  }
}

async function handleButton(ctx, text) {
  console.log(`>>> Кнопка: "${text}" от ${ctx.from.id}`);
  
  const cleanText = text
    .replace(/[^\w\s\u0400-\u04FF]/gu, '')
    .trim()
    .toLowerCase();
  
  // Отмена
  if (text === '❌ Отмена') {
    if (ctx.session?.parcelStep) {
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
    }
    if (ctx.session?.warehouseStep) {
      delete ctx.session.warehouseStep;
      delete ctx.session.warehouseData;
      delete ctx.session.editingItemId;
    }
    
    await ctx.reply('❌ Операция отменена.', {
      reply_markup: {
        keyboard: [
          ['📦 Все посылки', '➕ Добавить посылку'],
          ['🏪 Склад', '✏️ Редактировать склад'],
          ['📊 Статистика', '🆘 Помощь']
        ],
        resize_keyboard: true
      }
    });
    return;
  }
  
  // Основные кнопки
  if (cleanText.includes('все посыл') || cleanText.includes('посыл')) {
    await handleAllParcels(ctx);
  } 
  else if (cleanText.includes('добав')) {
    await handleAddParcel(ctx);
  }
  else if (cleanText.includes('склад') && !cleanText.includes('редакт')) {
    await handleWarehouse(ctx);
  }
  else if (cleanText.includes('редакт')) {
    await handleEditWarehouse(ctx);
  }
  else if (cleanText.includes('статистик')) {
    await handleStatistics(ctx);
  }
  else if (cleanText.includes('помощ')) {
    await handleHelp(ctx);
  }
  else {
    await ctx.reply(`Не понимаю: "${text}". Используйте кнопки меню.`);
  }
}

// ========== CALLBACK ОБРАБОТЧИКИ ==========

// Посылки
bot.action('refresh_parcels', async (ctx) => {
  await ctx.answerCbQuery();
  await handleAllParcels(ctx);
});

bot.action('change_parcel_status', async (ctx) => {
  await ctx.answerCbQuery();
  await handleChangeParcelStatus(ctx);
});

bot.action(/^select_parcel_status_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const parcelId = ctx.match[1];
  await handleSelectParcelStatus(ctx, parcelId);
});

bot.action(/^update_parcel_status_(\d+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const parcelId = ctx.match[1];
  const newStatus = ctx.match[2];
  await handleUpdateParcelStatus(ctx, parcelId, newStatus);
});

bot.action('delete_parcel_select', async (ctx) => {
  await ctx.answerCbQuery();
  await handleDeleteParcelSelect(ctx);
});

bot.action(/^confirm_delete_parcel_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const parcelId = ctx.match[1];
  await handleConfirmDeleteParcel(ctx, parcelId);
});

bot.action(/^delete_parcel_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const parcelId = ctx.match[1];
  await handleDeleteParcel(ctx, parcelId);
});

bot.action('cancel_delete_parcel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ Удаление отменено');
});

bot.action('back_to_parcels', async (ctx) => {
  await ctx.answerCbQuery();
  await handleAllParcels(ctx);
});

// Склад
bot.action('edit_warehouse', async (ctx) => {
  await ctx.answerCbQuery();
  await handleEditWarehouse(ctx);
});

bot.action(/^edit_item_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.match[1];
  await handleEditItem(ctx, itemId);
});

bot.action(/^edit_qty_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.match[1];
  ctx.session.warehouseStep = 'edit_quantity';
  ctx.session.editingItemId = itemId;
  await ctx.reply('Введите новое количество товара:');
});

bot.action(/^edit_min_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.match[1];
  ctx.session.warehouseStep = 'edit_min_quantity';
  ctx.session.editingItemId = itemId;
  await ctx.reply('Введите новый минимальный остаток:');
});

bot.action(/^edit_loc_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.match[1];
  ctx.session.warehouseStep = 'edit_location';
  ctx.session.editingItemId = itemId;
  await ctx.reply('Введите новое место хранения:');
});

bot.action(/^delete_item_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.match[1];
  
  try {
    await db.execute('DELETE FROM warehouse WHERE id = ?', [itemId]);
    await ctx.reply('✅ Товар удален со склада!');
    await handleEditWarehouse(ctx);
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    await ctx.reply('❌ Ошибка удаления товара');
  }
});

bot.action('back_to_warehouse', async (ctx) => {
  await ctx.answerCbQuery();
  await handleWarehouse(ctx);
});

// Админ
bot.action('view_requests', async (ctx) => {
  await ctx.answerCbQuery();
  await handleRequests(ctx);
});

bot.action(/^approve_(\d+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  
  await ctx.answerCbQuery();
  
  if (ctx.from.id !== config.ADMIN_ID) {
    return;
  }
  
  try {
    const [request] = await db.query(
      `SELECT ar.*, u.telegram_id, u.first_name 
       FROM access_requests ar 
       JOIN users u ON ar.user_id = u.id 
       WHERE ar.id = ?`,
      [requestId]
    );
    
    if (request) {
      await AccessRequest.updateStatus(requestId, 'approved', ctx.from.id);
      await User.updateStatus(request.user_id, true);
      
      try {
        await bot.telegram.sendMessage(
          request.telegram_id,
          '✅ Ваш запрос одобрен! /start'
        );
      } catch (err) {
        console.error('Уведомление пользователю:', err.message);
      }
      
      await ctx.editMessageText(`✅ Запрос #${requestId} одобрен`);
    }
  } catch (error) {
    console.error('Ошибка approve:', error);
    await ctx.editMessageText('❌ Ошибка');
  }
});

bot.action(/^reject_(\d+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  
  await ctx.answerCbQuery();
  
  if (ctx.from.id !== config.ADMIN_ID) {
    return;
  }
  
  try {
    const [request] = await db.query(
      `SELECT ar.*, u.telegram_id 
       FROM access_requests ar 
       JOIN users u ON ar.user_id = u.id 
       WHERE ar.id = ?`,
      [requestId]
    );
    
    if (request) {
      await AccessRequest.updateStatus(requestId, 'rejected', ctx.from.id);
      
      try {
        await bot.telegram.sendMessage(
          request.telegram_id,
          '❌ Ваш запрос отклонен.'
        );
      } catch (err) {
        console.error('Уведомление пользователю:', err.message);
      }
      
      await ctx.editMessageText(`❌ Запрос #${requestId} отклонен`);
    }
  } catch (error) {
    console.error('Ошибка reject:', error);
    await ctx.editMessageText('❌ Ошибка');
  }
});

// ========== ОСНОВНЫЕ ОБРАБОТЧИКИ ==========

// 1. Логирование
bot.use(async (ctx, next) => {
  if (ctx.message?.text) {
    console.log(`\n📨 ${ctx.from.id}: "${ctx.message.text}"`);
  }
  await next();
});

// 2. Обработка ввода данных
bot.on('message', async (ctx, next) => {
  if (ctx.session?.parcelStep && ctx.message?.text && ctx.message.text !== '❌ Отмена') {
    await handleParcelInput(ctx);
    return;
  }
  
  if (ctx.session?.warehouseStep && ctx.message?.text && ctx.message.text !== '❌ Отмена') {
    await handleWarehouseInput(ctx);
    return;
  }
  
  await next();
});

// 3. Обработка команд
bot.on('text', async (ctx, next) => {
  if (ctx.message.text.startsWith('/')) {
    await handleCommand(ctx, ctx.message.text);
    return;
  }
  
  await next();
});

// 4. Обработка кнопок
bot.on('text', async (ctx) => {
  await handleButton(ctx, ctx.message.text);
});

// ========== ЗАПУСК ==========

async function startBot() {
  try {
    await initModules();
    
    await bot.launch();
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 БОТ УСПЕШНО ЗАПУЩЕН!');
    console.log('='.repeat(60));
    console.log(`👑 Администратор: ${config.ADMIN_ID || 'не установлен'}`);
    console.log(`📊 База данных: ${config.DB.database}`);
    console.log('='.repeat(60));
    console.log('\n📋 Функционал:');
    console.log('   • 📦 Все посылки видны всем');
    console.log('   • ✏️ Изменение статусов посылок');
    console.log('   • 🗑️ Удаление посылок');
    console.log('   • 🏪 Управление складом');
    console.log('   • 📊 Статистика системы');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ ОШИБКА ЗАПУСКА БОТА:', error);
    process.exit(1);
  }
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Остановка бота...');
  bot.stop('SIGINT');
  process.exit(0);
});