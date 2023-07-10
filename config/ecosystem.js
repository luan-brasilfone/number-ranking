module.exports = {
    base_dir:        process.env.BASE_DIR                      || __dirname,
    app_name:        process.env.APP_NAME                      || 'ranking-app',
    api_name:        process.env.API_NAME                      || 'ranking-api',
    app_watch:       process.env.APP_WATCH.toLowerCase()       || 'no',
    api_watch:       process.env.API_WATCH.toLowerCase()       || 'no',
    app_script:      process.env.APP_SCRIPT                    || 'app.js',
    api_script:      process.env.API_SCRIPT                    || 'api.js',
    app_instances:   process.env.APP_INSTANCES                 || 1,
    app_autorestart: process.env.APP_AUTORESTART.toLowerCase() || 'yes',
    api_autorestart: process.env.API_AUTORESTART.toLowerCase() || 'yes',
};