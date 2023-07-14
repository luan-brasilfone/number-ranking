const config = require('../../config/app');
const utils = require('../scripts/utils');
const redis_client = require('../db/redis');
const postgres_client = require('../db/postgres');

const log_controller = require('./log-controller');

exports.reSyncCursor = async (number) => {

    try {

        const clause = {
            select: `*, split_part(number_provider, '_', 1) as provider`,
            from: `history`,
            where: `number_provider LIKE '${number}_%'`,
        }
        const query = `SELECT ${clause.select} FROM ${clause.from} WHERE ${clause.where}`;

        const history = await postgres_client.query(query);
        const cursor = { total: 0, sms_counter: 0 };
        
        history.rows.forEach((row) => {

            const provider = row.provider;

            cursor[provider] = cursor[provider] || { total: 0, statement: "insert" };

            cursor.total += row.sms.peso;
            if (cursor[provider].statement == "insert")
                cursor.sms_counter++;
            
            cursor[provider].total++;
            if (cursor[provider].total == 10)
                cursor[provider] = { total: 0, statement: "update" };            
        });

        await redis_client.HSET(`cursor`, { [number]: JSON.stringify(cursors[number]) });
    }
    catch (error) {
        console.log(`${new Date().toLocaleTimeString()} - Could not re-sync cursor for ${number}... Re-trying in a few seconds...`);
        console.error(error);

        await utils.sleep(config.delay);
        await this.reSyncCursor(number);
    }
}

exports.persistProviders = async () => {

    while (true) {

        let code = await redis_client.LPOP(`persist-provider`);

        if (code == null)
            break;

        const method = code.slice(0, 3);
        code = code.replace(`${method}/`, '');

        if (method == 'del') {

            console.log(`${new Date().toLocaleTimeString()} - Deleting provider ${code} on this.instance ${this.instance}`);

            try{
                await redis_client.DEL(`provider-${code}`);
                await postgres_client.query(`DELETE FROM provider WHERE code = '${code}'`);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'success',
                    date: new Date().getTime(),
                    message: `Successfully deleted provider`
                };
        
                await redis_client.RPUSH(`log-provider-${this.instance}`, JSON.stringify(log));

                continue;
            }
            catch (error) {
                console.error(`${new Date().toLocaleTimeString()} - Could not delete provider ${code} on this.instance ${this.instance}... Skipping...`);
                console.error(error);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'error',
                    date: new Date().getTime(),
                    message: `Could not delete provider`
                };
        
                await redis_client.RPUSH(`log-provider-${this.instance}`, JSON.stringify(log));
            }
        }

        let provider = await redis_client.HGET(`provider`, code);

        if (provider == null)
            continue;

        provider = JSON.parse(provider);

        console.log(`${new Date().toLocaleTimeString()} - Inserting provider ${code} on this.instance ${this.instance}`);

        const fields = new Array();
		fields.push(`'${code}'`);
		fields.push(`'${provider['mo']}'`);
		fields.push(`'${provider['s200']}'`);
		fields.push(`'${provider['s404']}'`);
		fields.push(`'${provider['s500']}'`);
		fields.push(`'${provider['s503']}'`);
		fields.push(`'${provider['default']}'`);

        try {
            const clause = {
                insert_into: `provider (code, "MO", "s200", "s404", "s500", "s503", "default")`,
                values: `(${fields.join(', ')})`,
                on_conflict: `code`,
                do_update: `SET "MO" = '${provider['mo']}', "s200" = '${provider['s200']}', "s404" = '${provider['s404']}', "s500" = '${provider['s500']}', "s503" = '${provider['s503']}', "default" = '${provider['default']}'`
            };
            const query = `INSERT INTO ${clause.insert_into} VALUES ${clause.values} ON CONFLICT (${clause.on_conflict}) DO UPDATE ${clause.do_update}`;

            await postgres_client.query(query);

            let log = {
                type: 'provider',
                code: code,
                status: 'success',
                date: new Date().getTime(),
                message: `Successfully inserted provider`
            };

            await redis_client.RPUSH(`log-provider-${this.instance}`, JSON.stringify(log));
        }
        catch (error) {
            console.error(`${new Date().toLocaleTimeString()} - Could not insert provider ${code} on this.instance ${this.instance}... Skipping...`);
            console.error(error);

            let log = {
                type: 'provider',
                code: code,
                status: 'error',
                date: new Date().getTime(),
                message: `Could not insert provider`
            };
    
            await redis_client.RPUSH(`log-provider-${this.instance}`, JSON.stringify(log));
        }
    }
}

exports.persistMo = async () => {

    while (true) {

        const number = await redis_client.SPOP(`mo-to-postgres`);

        if (number == null)
            break;

        const mo = await redis_client.HGET(`mo`, number);

        if (mo == null)
            continue;

        const clause = {
            insert_into: `mo ("number", "balance", "date")`,
            values: `('${number}', '${mo}', '${utils.getYmdDate(new Date())}')`,
            on_conflict: `number`,
            do_update: `SET balance = ${mo}, date = '${utils.getYmdDate(new Date())}'`
        };
        const query = `INSERT INTO ${clause.insert_into} VALUES ${clause.values} ON CONFLICT (${clause.on_conflict}) DO UPDATE ${clause.do_update}`;

        try {
            await postgres_client.query(query);
        }
        catch (error) {
            console.error(`${new Date().toLocaleTimeString()} - Could not insert MO for ${number}... Skipping...`);
            console.error(error);

            let log = {
                type: 'mo',
                number: number,
                provider: 'unknown',
                status: 'error',
                date: new Date().getTime(),
                message: `Could not insert MO`
            };
    
            await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log));
        }
    }
}

exports.manageTasks = async (task) => {

    switch (task) {
        case 'set-dashboard':
            let timer = Date.now();
            await this.setDashboard();
            timer = Date.now() - timer;

            console.timeEnd(`${new Date().toLocaleTimeString()} - Time took to set dashboard on this.instance ${this.instance}: ${timer}ms`);
            break;

        case 'persist-provider':
            await this.persistProviders();
            break;

        default:
            break;
    }
}

exports.persistData = async (data_type) => {

    switch (data_type) {
        case 'mo':
            await this.persistMo();
            break;
        case 'log':
            await log_controller.persist(this.instance);
            break;
        default:
            break;
    }
}

exports.hasMo = async (sms, cursor, provider_leverage) => {

    let mo = await redis_client.HGET(`mo`, sms.numero);
    const has_new_mo = mo == null && sms.status.toLowerCase() == 'mo';
    
    if (has_new_mo) {
        mo = 1001

        let log = {
            type: 'mo',
            number: sms.numero,
            provider: sms.fornecedor,
            status: 'success',
            date: new Date().getTime(),
            message: `New MO`
        };

        await redis_client.RPUSH(`log-mo-${this.instance}`, JSON.stringify(log));
    }
    
	if (mo != null) {
        
        mo--;
        if (mo == 0){

            await redis_client.HDEL(`mo`, sms.numero);

            let log = {
                type: 'mo',
                number: sms.numero,
                provider: sms.fornecedor,
                status: 'success',
                date: new Date().getTime(),
                message: `MO is over`
            };
    
            await redis_client.RPUSH(`log-mo-${this.instance}`, JSON.stringify(log));
        }
        else {

            try {
    
                await redis_client.HSET(`mo`, { [sms.numero]: mo });
                await redis_client.SADD(`mo-to-postgres`, sms.numero);
            }
            catch (error) {
    
                console.log(`${new Date().toLocaleTimeString()} - Could not save MO for ${sms.numero}... Skipping...`);
                console.error(error);
            }
        }

        [sms.peso, sms.pesoFornecedor] = [100, provider_leverage];

        await this.persistSms(sms, cursor);

        return true;
	}

    return false;
}

exports.updateCursor = async (sms, cursor) => {

    try{

        if (cursor[sms.fornecedor].statement == "update"){

            let old_leverage = await postgres_client.query(`SELECT sms FROM history WHERE number_provider = '${sms.numero}_${sms.fornecedor}_${cursor[sms.fornecedor]}'`);
    
            cursor.total -= old_leverage.rows[0].sms.peso;
        }

        cursor.total += sms.peso, cursor[sms.fornecedor].total++;
        
        if (cursor[sms.fornecedor].statement == "insert") cursor.sms_counter++;

        if (cursor[sms.fornecedor].total == 10)
            cursor[sms.fornecedor].total = 0, cursor[sms.fornecedor].statement = "update";            

        await redis_client.HSET(`cursor`, { [sms.numero]: JSON.stringify(cursor) });
    }
    catch (error){
        console.error(`${new Date().toLocaleTimeString()} - Could not update cursor for ${sms.numero} on ${sms.fornecedor}... Re-syncing...`);
        console.error(error);

        await reSyncCursor(sms.numero);
    }
}

exports.persistSms = async (sms, cursor) => {

    let success = false;
    try {

        const [number, provider] = [sms.numero, sms.fornecedor];
        delete sms.numero, delete sms.fornecedor;

        const clause = {
            insert_into: `history (number_provider, sms)`,
            values: `'${number}_${provider}_${cursor[provider].total}', '${JSON.stringify(sms)}'`,
            on_conflict: `number_provider`,
            do_update: `SET sms = '${JSON.stringify(sms)}'`
        };

        query = `INSERT INTO ${clause.insert_into} VALUES (${clause.values}) ON CONFLICT (${clause.on_conflict}) DO UPDATE ${clause.do_update}`;

        await postgres_client.query(query);

        [sms.numero, sms.fornecedor] = [number, provider];
        success = true;
    }
    catch (error) {
        let output = `${new Date().toLocaleTimeString()} - Could not insert history for ${sms.numero} on ${sms.fornecedor}... `;
        output += sms.tries ? `Tried ${sms.tries} times... ` : `Tried 1 time... `;

        console.error(output);
        console.error(error);
        console.error({sms: sms, cursor: cursor})

        let log = {
            type: 'history',
            number: sms.numero,
            provider: sms.fornecedor,
            status: sms.status,
            date: new Date().getTime(),
            message: 'Could not insert history'
        };

        await redis_client.RPUSH(`log-history-${this.instance}`, JSON.stringify(log));

        delete sms.peso, delete sms.pesoFornecedor;

        sms.tries ? sms.tries++ : sms.tries = 2;

        if (sms.tries > 3) return rank;

        await redis_client.RPUSH(`sms-ranking-${this.instance}`, JSON.stringify(sms));
    }

    if (success) {

        await this.updateCursor(sms, cursor);

        try {
            await redis_client.ZADD(`rank`, {score: Math.floor(cursor.total/cursor.sms_counter), value: sms.numero});
        }
        catch (error) {

            console.log(`${new Date().toLocaleTimeString()} - Could not update rank for ${sms.numero}... Skipping...`);
            console.error(error);
            console.log('sms', sms, 'cursor', cursor);
        }

        try {
            let log = {
                type: 'history',
                number: sms.numero,
                provider: sms.fornecedor,
                status: sms.status,
                date: new Date().getTime(),
                rank: Math.floor(cursor.total / cursor.sms_counter),
                message: 'Successfully inserted history'
            };

            await redis_client.RPUSH(`log-history-${this.instance}`, JSON.stringify(log));
        }
        catch (error) {
            console.error(`${new Date().toLocaleTimeString()} - Could not log history for ${sms.numero} on ${sms.fornecedor}... Skipping...`);
            console.error(error);
        }
    }
}

exports.calculateRank = (number_average, provider_leverage, status) => {

    let rank;
    const has_good_status = status == 's200';

    if (has_good_status){

        const leverage = (100 - provider_leverage) / 100;
        rank = 50 + Math.round(number_average * (2 + leverage));

        if (rank > 100) rank = 100;
    }
    else {
        let leverage = provider_leverage / 2;
        leverage = (100 - leverage) / 100;

        rank = Math.round(number_average * leverage);
    }

    return rank;
}

exports.rankSms = async (sms) => {

    let provider = await redis_client.HGET(`provider`, sms.fornecedor);

    if (provider === null)
        return;
    
    provider = JSON.parse(provider);

    let cursor = await redis_client.HGET(`cursor`, sms.numero);

    cursor = JSON.parse(cursor) || {"total": 0, "sms_counter": 0};
    cursor[sms.fornecedor] = cursor[sms.fornecedor] || {"total": 0, "statement": "insert"};
    
    const provider_leverage = provider[sms.status.toLowerCase()];
    const has_mo = await this.hasMo(sms, cursor, provider_leverage);
    
    if (has_mo)
        return 100;

    const number_average = cursor.total === 0 ? 50 : Math.floor(cursor.total / cursor.sms_counter);

    const rank = this.calculateRank(number_average, provider_leverage, sms.status);

    [sms.peso, sms.pesoFornecedor] = [rank, provider_leverage];

    await this.persistSms(sms, cursor);
    
    return rank;
}

exports.processSmsList = async () => {

    while (true) {

        const has_priority_task = await redis_client.SCARD(`priority-task`) > 0;

        if (has_priority_task) {
            const task = await redis_client.SPOP(`priority-task`);

            await this.manageTasks(task);
            continue;
        }

        let sms = await redis_client.LPOP(`sms-ranking-${this.instance}`);
        const finished_processing = sms === null;
        
        if (finished_processing)
            break;
    
        sms = JSON.parse(sms);
    
        const history = await this.rankSms(sms);
        const provider_not_found = history === undefined;

        if (provider_not_found)
            console.log(`${new Date().toLocaleTimeString()} - Provider ${sms.fornecedor} not found. Skipping...`);
    }
}

exports.setDashboard = async () => {

    const dashboard = new Object();

    dashboard.providers = await redis_client.HLEN(`provider`);
    dashboard.mos = await redis_client.HLEN(`mo`);
    dashboard.ranks = await redis_client.ZCOUNT(`rank`, '-inf', '+inf');    

    const history_logs = new Object();
    for (let i = 0; i < 14; i++){

        const date = utils.getYmdDate(new Date());

        const clause = {
            select: `to_timestamp(date/1000)::date AS log_date, status || ': ' || count(status) as count`,
            from: `log_history`,
            where: `to_timestamp(date/1000)::date = '${date}'::date - interval '${i} days'`,
            group_by: `log_date, status`
        }
        const query = `SELECT ${clause.select} FROM ${clause.from} WHERE ${clause.where} GROUP BY ${clause.group_by}`;

        const result = await postgres_client.query(query);

        result.rows.forEach((row) => {
            const date = row.log_date;
            const [status, logs_quantity] = row.count.split(':');

            const first_iteration_from_date = history_logs[date] === undefined;

            if (first_iteration_from_date)
                history_logs[date] = new Object();

            history_logs[date][status] = logs_quantity;
        });
    }
    dashboard.log_history = history_logs;

    const queries = {
        log_mo: `SELECT * FROM log_mo WHERE message = 'New MO' ORDER BY id desc LIMIT 3;`,
        ranked_by_provider: `SELECT COUNT (*), provider AS code from log_history GROUP BY provider ORDER BY count`,
        history_errors: `SELECT COUNT (*) FROM log_history WHERE "message" = 'Could not insert history'`,
        mo_errors: `SELECT COUNT (*) FROM log_mo WHERE status = 'error'`,
        provider_errors: `SELECT COUNT (*) FROM log_provider WHERE status = 'error'`
    };

    const log_mo = await postgres_client.query(queries.log_mo);
    dashboard.log_mo = log_mo.rows;

    const ranked_by_provider = await postgres_client.query(queries.ranked_by_provider);
    dashboard.ranked_by_provider = ranked_by_provider.rows;

    let error_logs = await postgres_client.query(queries.history_errors);
    dashboard.error_logs = parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(queries.mo_errors);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(queries.provider_errors);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    await redis_client.SET(`dashboard`, JSON.stringify(dashboard));
}

exports.startApp = async () => {

    const ioredis = require('ioredis');
    const redis = new ioredis();
    const cursors = new Object();
    let counter = 0;

    // DELETE
    await redis_client.DEL(`provider`);
    await redis_client.DEL(`mo`);
    await redis_client.DEL(`cursor`);
    await redis_client.DEL(`rank`);

    // SET
    const providers_wrapper = await postgres_client.query('SELECT * FROM provider');
    const has_providers = providers_wrapper.rows.length > 0;
    
    if (has_providers) {
        providers_wrapper.rows.forEach(provider => {

            const code = provider.code;
            delete provider.code;

            Object.keys(provider).forEach((value, key) => {
                const status = value.toString().toLowerCase();
                const leverage = provider[value];

                delete provider[value];

                provider[status] = leverage;
            });

            redis_client.HSET(`provider`, { [code]: JSON.stringify(provider) });
        });

        delete providers_wrapper;
    }

    let query = `SELECT COUNT(*), split_part(number_provider, '_', 1) as number FROM history GROUP BY number`;
    let number_sms_counter_wrapper = await postgres_client.query(query);
    const sms_counter = new Object();

    for (row of number_sms_counter_wrapper.rows) {
        sms_counter[row.number] = row.count;
        delete row;
    }
    number_sms_counter_wrapper = undefined;

    while (true) {

        const pipeline = new ioredis.Pipeline(redis);

        let clause = {
            select: `COUNT(*), split_part(number_provider, '_', 1) || '~' || split_part(number_provider, '_', 2) as id,
                     sum( (sms->'peso')::integer )`,
            from: `history`,
            group_by: `id`,
            order_by: `2`,
            limit: `500000`,
            offset: `${counter * 500000}`
        };

        query = `SELECT ${clause.select} FROM ${clause.from} GROUP BY ${clause.group_by} ORDER BY ${clause.order_by} LIMIT ${clause.limit} OFFSET ${clause.offset}`;
        
        let history = await postgres_client.query(query);

        if (history.rows.length == 0)
            break;

        while (history.rows.length){

            const row = history.rows.pop();
            const [number, provider] = row.id.split('~');
            
            const cursor = cursors[number] || { total: 0, sms_counter: 0 };

            cursor.total += parseInt(row.sum), cursor.sms_counter += parseInt(row.count);
            cursor[provider] = { total: row.count, statement: "insert" };

            if (cursor.sms_counter == sms_counter[number]) {

                pipeline.hset(`cursor`, { [number]: JSON.stringify(cursor) });
                pipeline.zadd(`rank`, Math.floor(cursor.total / cursor.sms_counter), number);

                delete cursors[number];
            }
            else {
                cursors[number] = cursor;
            }
        }
    
        counter++;
        await pipeline.exec();
    }
}

exports.executeOnInstance = async (instance, method, input) => {
 
    this.instance = instance;
    input = input || [];
    const output = await this[method](input.join(','));
    return output;
}