// This controller uses redis to persist logs

const redis_client = require('../db/redis');
const postgres_client = require('../db/postgres');

exports.persist = async function (instance) {

    const has_history_log = await redis_client.LLEN(`log-history-${instance}`) > 0;

    if (has_history_log)
        await this.persistHistory(instance);

    const has_provider_log = await redis_client.LLEN(`log-provider-${instance}`) > 0;

    if (has_provider_log)
        await this.persistProvider(instance);

    const has_mo_log = await redis_client.LLEN(`log-mo-${instance}`) > 0;

    if (has_mo_log)
        await this.persistMo(instance);
}

exports.persistHistory = async function (instance) {

    let query = `INSERT INTO log_history ("number", "provider", "status", "message", "date", "rank") VALUES `;

    while (true) {
 
        let log = await redis_client.LPOP(`log-history-${instance}`);
        
        if (log == null)
            break;

        log = JSON.parse(log);

        const values = `('${log.number}', '${log.provider}', '${log.status}', '${log.message}', '${log.date}', '${log.rank}'), `;
        query += values;
    }

    query = query.slice(0, -2);

    try {
        await postgres_client.query(query);
    }
    catch (error) {
        console.error(`${new Date().toLocaleTimeString()} - Could not insert history logs on instance ${instance}... Skipping...`);
        console.error(error);
        console.error(query);
    }
}

exports.persistProvider = async function (instance) {

    let query = `INSERT INTO log_provider ("code", "status", "message", "date") VALUES `;

    while (true) {
 
        let log = await redis_client.LPOP(`log-provider-${instance}`);
        
        if (log == null)
            break;

        log = JSON.parse(log);

        const values = `('${log.code}', '${log.status}', '${log.message}', '${log.date}'), `;
        query += values;
    }

    query = query.slice(0, -2);

    try {
        await postgres_client.query(query);
    }
    catch (error) {
        console.error(`${new Date().toLocaleTimeString()} - Could not insert provider logs on instance ${instance}... Skipping...`);
        console.error(error);
        console.error(query);
    }
}

exports.persistMo = async function (instance) {
    
    let query = `INSERT INTO log_mo ("number", "provider", "status", "message", "date") VALUES `;

    while (true) {

        let log = await redis_client.LPOP(`log-mo-${instance}`);
        
        if (log == null)
            break;

        log = JSON.parse(log);

        const values = `('${log.number}', '${log.provider}', '${log.status}', '${log.message}', '${log.date}'), `;
        query += values;
    }

    query = query.slice(0, -2);

    try {
        await postgres_client.query(query);
    }
    catch (error) {
        console.error(`${new Date().toLocaleTimeString()} - Could not insert MO logs on instance ${instance}... Skipping...`);
        console.error(error);
        console.error(query);
    }
}