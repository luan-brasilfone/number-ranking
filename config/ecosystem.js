module.exports = {
    base_dir:               process.env.BASE_DIR                             || __dirname,
    app_instances:          process.env.APP_INSTANCES                        || 1,
    start_simulation:       process.env.START_SIMULATION.toLowerCase()       || 'no',
    
    app_name:               process.env.APP_NAME                             || 'ranking-app',
    api_name:               process.env.API_NAME                             || 'ranking-api',
    simulation_name:        process.env.SIMULATION_AUTORESTART.toLowerCase() || 'ranking-simulation',
    app_watch:              process.env.APP_WATCH.toLowerCase()              || 'no',
    api_watch:              process.env.API_WATCH.toLowerCase()              || 'no',
    simulation_watch:       process.env.API_WATCH.toLowerCase()              || 'no',
    app_script:             process.env.APP_SCRIPT                           || 'app.js',
    api_script:             process.env.API_SCRIPT                           || 'api.js',
    simulation_script:      process.env.SIMULATION_SCRIPT                    || 'simulation.js',
    app_autorestart:        process.env.APP_AUTORESTART.toLowerCase()        || 'yes',
    api_autorestart:        process.env.API_AUTORESTART.toLowerCase()        || 'yes',
    simulation_autorestart: process.env.SIMULATION_AUTORESTART.toLowerCase() || 'yes',
};