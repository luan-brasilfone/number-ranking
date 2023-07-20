module.exports = {
    delay:               process.env.APP_DELAY                 ||  30,
    check_database:      process.env.CHECK_DATABASE            || 'yes',
    cursor_memory_limit: process.env.CURSOR_MEMORY_LIMIT_IN_MB ||  1024,
};
