module.exports = {
    base_dir:               process.env.BASE_DIR                             || __dirname,
    app_instances:          process.env.APP_INSTANCES                        || 1,
    start_simulation:       process.env.START_SIMULATION.toLowerCase()       || 'no',
    
    api_name:               process.env.API_NAME                             || 'ranking-api',
    api_watch:              process.env.API_WATCH.toLowerCase()              || 'no',
    api_script:             process.env.API_SCRIPT                           || 'api.js',
    api_autorestart:        process.env.API_AUTORESTART.toLowerCase()        || 'yes',
    app_name:               process.env.APP_NAME                             || 'ranking-app',
    app_watch:              process.env.APP_WATCH.toLowerCase()              || 'no',
    app_script:             process.env.APP_SCRIPT                           || 'app.js',
    app_autorestart:        process.env.APP_AUTORESTART.toLowerCase()        || 'yes',
    simulation_name:        process.env.SIMULATION_NAME.toLowerCase()        || 'ranking-simulation',
    simulation_watch:       process.env.SIMULATION_WATCH.toLowerCase()       || 'no',
    simulation_script:      process.env.SIMULATION_SCRIPT                    || 'simulation.js',
    simulation_autorestart: process.env.SIMULATION_AUTORESTART.toLowerCase() || 'yes',
};