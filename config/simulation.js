module.exports = {
    min_delay:          process.env.MIN_DELAY                   || 10,
    max_delay:          process.env.MAX_DELAY                   || 60,
    log_responses:      process.env.LOG_RESPONSES.toLowerCase() || 'no',
    sms_quantity:       process.env.SMS_QUANTITY                || 1000,
    numbers_quantity:   process.env.NUMBERS_QUANTITY            || 100,
    providers_quantity: process.env.PROVIDERS_QUANTITY          || 10,
};
