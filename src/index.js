require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const database = require('./database/connection');
const { setupReminders } = require('./utils/reminders');

// Импорт обработчиков
const authHandlers = require('./handlers/auth');
const adminHandlers = require('./handlers/admin');
const userHandlers = require('./handlers/user');
const parcelHandlers = require('./handlers/parcel');
const warehouseHandlers = require('./handlers/warehouse');
const orderHandlers = require('./handlers/order');
const settingsHandlers = require('./handlers/settings');
const commonHandlers = require('./handlers/common');
const notificationHandlers = require('./handlers/notifications');

// Middleware
const authMiddleware = require('./middleware/auth');

// Инициализация бота
const bot = new TelegramBot(config.BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Глобальный объект для хранения состояния
bot.state = {};

// Инициализация обработчиков
async function initHandlers() {
  try {
    // Общие обработчики
    setupGlobalHandlers();
    
    // Регистрируем обработчики из всех модулей
    authHandlers(bot);
    adminHandlers(bot);
    userHandlers(bot);
    parcelHandlers(bot);
    warehouseHandlers(bot);
    orderHandlers(bot);
    settingsHandlers(bot);
    commonHandlers(bot);
    notificationHandlers(bot);
    
    // Настраиваем напоминания
    setupReminders(bot);
    
    console.log('✅ Все обработчики инициализированы');
  } catch (error) {
    console.error('❌ Ошибка инициализации обработчиков:', error);
  }
}

function setupGlobalHandlers() {
  // Обработка ошибок
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
  });
  
  bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
  });
  
  // Приветствие при старте бота
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      // Проверяем, есть ли пользователь в базе
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (user) {
        if (user.is_active) {
          await bot.sendMessage(chatId, 
            `👋 С возвращением, ${user.first_name}!\n\n` +
            'Используйте меню для управления вашими посылками и заказами.',
            { parse_mode: 'HTML' }
          );
        } else {
          await bot.sendMessage(chatId,
            '🔄 Ваш аккаунт ожидает подтверждения администратора.\n' +
            'Мы уведомим вас, когда доступ будет предоставлен.'
          );
        }
      } else {
        await bot.sendMessage(chatId,
          '👋 Добро пожаловать в China Manager Bot!\n\n' +
          '📦 Этот бот поможет вам отслеживать посылки из Китая\n' +
          '📊 Управлять складскими остатками\n' +
          '🔔 Получать уведомления о статусах\n\n' +
          'Для начала работы необходимо получить доступ у администратора.\n' +
          'Используйте команду /request_access'
        );
      }
    } catch (error) {
      console.error('Ошибка при старте:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при запуске бота.');
    }
  });
  
  // Помощь
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpText = `
📚 <b>Доступные команды:</b>

<b>Основные:</b>
/start - Начать работу с ботом
/help - Показать это сообщение
/menu - Открыть главное меню

<b>Посылки:</b>
/parcels - Мои посылки
/add_parcel - Добавить посылку
/track - Отследить посылку

<b>Склад:</b>
/warehouse - Состояние склада
/low_stock - Товары с низким запасом

<b>Настройки:</b>
/settings - Настройки бота
/notifications - Управление уведомлениями

<b>Для администраторов:</b>
/admin - Админ панель
/users - Управление пользователями
/requests - Запросы на доступ
    `;
    
    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
  });
  
  // Главное меню
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        await bot.sendMessage(chatId, '❌ Ваш аккаунт не активирован.');
        return;
      }
      
      const menuOptions = {
        reply_markup: {
          keyboard: [
            ['📦 Мои посылки', '➕ Добавить посылку'],
            ['📊 Склад', '🔍 Найти товар'],
            ['⚙️ Настройки', '📢 Уведомления']
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };
      
      await bot.sendMessage(chatId, '🏠 <b>Главное меню</b>', {
        parse_mode: 'HTML',
        ...menuOptions
      });
    } catch (error) {
      console.error('Ошибка при показе меню:', error);
      await bot.sendMessage(chatId, '❌ Произошла ошибка.');
    }
  });
  
  // Отправка статуса бота (только для админов)
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ? AND is_admin = TRUE', [msg.from.id]);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Эта команда только для администраторов.');
        return;
      }
      
      // Получаем статистику
      const [usersCount] = await database.query('SELECT COUNT(*) as count FROM users');
      const [activeUsers] = await database.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE');
      const [parcelsCount] = await database.query('SELECT COUNT(*) as count FROM parcels');
      const [pendingRequests] = await database.query('SELECT COUNT(*) as count FROM access_requests WHERE status = "pending"');
      
      const statusText = `
📊 <b>Статус бота:</b>

👥 <b>Пользователи:</b>
   Всего: ${usersCount[0].count}
   Активных: ${activeUsers[0].count}

📦 <b>Посылки:</b>
   Всего: ${parcelsCount[0].count}

⏳ <b>Запросы на доступ:</b>
   Ожидают: ${pendingRequests[0].count}

🔄 <b>Система:</b>
   База данных: ✅ Работает
   Бот: ✅ Активен
   Напоминания: ✅ Активны
      `;
      
      await bot.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Ошибка при получении статуса:', error);
      await bot.sendMessage(chatId, '❌ Ошибка при получении статуса.');
    }
  });
  
  // Middleware для всех сообщений (кроме /start и /help)
  bot.on('message', async (msg) => {
    // Пропускаем команды start и help
    if (msg.text && (msg.text.startsWith('/start') || msg.text.startsWith('/help') || msg.text.startsWith('/about'))) {
      return;
    }
    
    // Проверяем аутентификацию через middleware
    const shouldContinue = await authMiddleware.requireAuth(msg, bot);
    
    if (!shouldContinue) {
      return; // Останавливаем обработку если пользователь не авторизован
    }
    
    // Если это команда, передаем ее дальше в соответствующий обработчик
    if (msg.text && msg.text.startsWith('/')) {
      // Позволяем другим обработчикам обработать команду
      return;
    }
    
    // Если это обычное сообщение, обрабатываем здесь
    const chatId = msg.chat.id;
    
    try {
      const user = await database.get('SELECT * FROM users WHERE telegram_id = ?', [msg.from.id]);
      
      if (!user || !user.is_active) {
        return;
      }
      
      // Простое эхо с подсказкой
      if (msg.text && msg.text.length > 0) {
        await bot.sendMessage(chatId,
          '🤖 Я получил ваше сообщение: "' + msg.text.substring(0, 50) + '"\n\n' +
          'Используйте команды из меню или /help для списка доступных команд.'
        );
      }
      
    } catch (error) {
      console.error('Ошибка при обработке сообщения:', error);
    }
  });
  
  // Middleware для callback запросов
  bot.on('callback_query', async (callbackQuery) => {
    // Проверяем аутентификацию через middleware
    const shouldContinue = await authMiddleware.requireAuthCallback(callbackQuery, bot);
    
    if (!shouldContinue) {
      return; // Останавливаем обработку если пользователь не авторизован
    }
    
    // Позволяем другим обработчикам обработать callback
    // (обработчики из других модулей сами подпишутся на этот event)
  });
}

// Основная функция запуска
async function startBot() {
  try {
    console.log('🚀 Запуск China Manager Bot...');
    console.log(`🤖 Токен бота: ${config.BOT_TOKEN.substring(0, 10)}...`);
    
    // Инициализация базы данных
    await database.init();
    
    // Инициализация обработчиков
    await initHandlers();
    
    console.log('✅ Бот успешно запущен и готов к работе!');
    
    // Обработка завершения
    process.on('SIGINT', async () => {
      console.log('\n🛑 Получен сигнал завершения...');
      bot.stopPolling();
      console.log('✅ Бот остановлен');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Получен сигнал завершения...');
      bot.stopPolling();
      console.log('✅ Бот остановлен');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Критическая ошибка при запуске бота:', error);
    process.exit(1);
  }
}

// Запуск бота
if (require.main === module) {
  startBot();
}

module.exports = bot;