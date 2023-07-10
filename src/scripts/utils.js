const redis_client = require('../db/redis');

exports.sleep = seconds => {
	return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

exports.getYmdDate = date => {

    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');

    return year + '-' + month + '-' + day;
}

exports.redisScan = async config => {
	
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
