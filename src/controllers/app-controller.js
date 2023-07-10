const utils = require('../scripts/utils');
const redis_client = require('../db/redis');
const postgres_client = require('../db/postgres');

exports.setDashboard = async () => {

    let dashboard = new Object();

    let providers = await redis_client.HLEN(`provider`);
    dashboard.providers = providers;

    let mos = await redis_client.HLEN(`mo`);
    dashboard.mos = mos;
    
    let ranks = await redis_client.ZCOUNT(`rank`, '-inf', '+inf');
    dashboard.ranks = ranks;

    let log_history = new Object();
    for (let i = 0; i < 14; i++){

        const date = utils.getYmdDate(new Date());

        const query = {
            select: `to_timestamp(date/1000)::date AS log_date, status || ': ' || count(status) as count`,
            from: `log_history`,
            where: `to_timestamp(date/1000)::date = '${date}'::date - interval '${i} days'`,
            group_by: `log_date, status`
        }

        query = `SELECT ${query.select} FROM ${query.from} WHERE ${query.where} GROUP BY ${query.group_by}`;
        let result = await postgres_client.query(query);

        result.rows.forEach((row) => {
            const [status, count] = row.count.split(':');

            if (log_history[row.log_date] == undefined) log_history[row.log_date] = new Object();
            log_history[row.log_date][status] = count;
        });
    }

    dashboard.log_history = log_history;

    const query = {
        log_mo: `SELECT * FROM log_mo WHERE message = 'New MO' ORDER BY id desc LIMIT 3;`,
        ranked_by_provider: `SELECT COUNT (*), provider AS code from log_history GROUP BY provider ORDER BY count`,
        history_errors: `SELECT COUNT (*) FROM log_history WHERE "message" = 'Could not insert history'`,
        mo_errors: `SELECT COUNT (*) FROM log_mo WHERE status = 'error'`,
        provider_errors: `SELECT COUNT (*) FROM log_provider WHERE status = 'error'`
    };

    let log_mo = await postgres_client.query(query.log_mo);

    dashboard.log_mo = log_mo.rows;

    let ranked_by_provider = await postgres_client.query(query.ranked_by_provider);

    dashboard.ranked_by_provider = ranked_by_provider.rows;

    let error_logs = await postgres_client.query(query.history_errors);
    dashboard.error_logs = parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(query.mo_errors);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(query.provider_errors);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    await redis_client.SET(`dashboard`, JSON.stringify(dashboard));
}

exports.startApp = async () => {

    // DELETE

    await redis_client.DEL(`provider`);
    await redis_client.DEL(`mo`);
    await redis_client.DEL(`cursor`);
    await redis_client.DEL(`rank`);

    // SET

    let providers_wrapper = await postgres_client.query('SELECT * FROM provider');
    
    if (providers_wrapper.rows.length > 0) {
        providers_wrapper.rows.forEach(provider => {

            const code = provider.code;
            delete provider.code;

            Object.keys(provider).forEach((value, key) => {
                const status = value.toString().toLowerCase();
                const leverage = provider[value];

                delete provider[value];

                provider[status] = provider_value;
            });

            redis_client.HSET(`provider`, { [code]: JSON.stringify(provider) });
        });

        delete providers_wrapper;
    }

    let counter = 0, limit = 100000, cursors = new Object();
    while (true) {

        const query = `SELECT * FROM history ORDER BY number_provider LIMIT ${limit} OFFSET ${counter * limit}`;

        let history = await postgres_client.query(query);

        if (history.rows.length == 0) break;
        
        let promises = history.rows.map(async (sms_entry, key) => {
            let [number, provider] = sms_entry.number_provider.split('_');

            let cursor = cursors[number] ? cursors[number] : { total: 0, sms_counter: 0 };
            cursor[provider] = cursor[provider] ? cursor[provider] : { total: 0, statement: "insert" };

            let providerCursor = cursor[provider];
          
            cursor.total += sms_entry.sms.peso, providerCursor.total++;
            if (providerCursor.statement == "insert")
                cursor.sms_counter++;

            cursors[number] = cursor;
        });

        await Promise.all(promises);

        counter++;
    }

    const ioredis = require('ioredis');
    const redis = new ioredis();
    const pipeline = redis.pipeline();

    cursors = Object.keys(cursors).forEach((number) => {

        pipeline.hset(`cursor`, { [number]: JSON.stringify(cursors[number]) });
    });
    pipeline.exec();
}