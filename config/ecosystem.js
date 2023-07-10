module.exports = {
    base_dir:        process.env.BASE_DIR                      || __dirname,
    app_autorestart: process.env.APP_AUTORESTART.toLowerCase() || true,
    api_autorestart: process.env.API_AUTORESTART.toLowerCase() || true,
    app_script:      process.env.APP_SCRIPT                    || 'app.js',
    api_script:      process.env.API_SCRIPT                    || 'api.js',
};