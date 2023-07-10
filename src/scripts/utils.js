const redis_client = require('../db/redis');

function sleep(seconds) {
	return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function redisScan(config) {
	
	const cursor 		= config.cursor 	|| 0;
	const options 		= config.options;
	const output 		= config.output 	|| [];
	const is_recursive 	= config.recursive 	|| true;

	if (options === undefined) return;

	let scan = await redis_client.SCAN(cursor, options);

	const promises = scan.keys.map(async key => {
		output.push(key);
	});

	await Promise.all(promises);

    if (is_recursive){

		if (scan.cursor != 0)
			await redisScan({cursor: scan.cursor, options: options, output: output});

		return output;
	}
	
	return { cursor: scan.cursor, output: output };
}

module.exports = {
	sleep,
	redisScan
};