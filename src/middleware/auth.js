const User = require('../models/User');

module.exports = {
  // Проверка авторизации
  checkAuth: () => {
    return async (ctx, next) => {
      const user = await User.findByTelegramId(ctx.from.id);
      
      if (!user || !user.is_active) {
        // Проверяем, если это команда /start или /zapros
        const allowedCommands = ['/start', '/zapros', '/help'];
        const isAllowed = allowedCommands.some(cmd => 
          ctx.message && ctx.message.text && ctx.message.text.startsWith(cmd)
        );
        
        if (!isAllowed) {
          await ctx.reply(
            '⛔ Доступ запрещен\n\n' +
            'Для получения доступа к функциям бота отправьте команду:\n' +
            '/zapros - запрос доступа\n\n' +
            'После одобрения администратора вы сможете пользоваться всеми функциями.'
          );
          return;
        }
      }
      
      ctx.user = user; // Добавляем пользователя в контекст
      await next();
    };
  },

  // Проверка прав администратора
  checkAdmin: () => {
    return async (ctx, next) => {
      const config = require('../config');
      
      if (ctx.from.id !== config.ADMIN_ID) {
        await ctx.reply('⛔ Эта команда доступна только администратору');
        return;
      }
      
      await next();
    };
  }
};