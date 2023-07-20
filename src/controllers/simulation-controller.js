const fs = require('fs');
const axios = require('axios');

const api = require('../../config/api');
let config = require('../../config/simulation');

const db = require('../scripts/db');

const file_limit = 1_000_000;
const files_quantity = Math.ceil(config.numbers_quantity / file_limit);

exports.checkProviders = () => {

    let providers;

    // Check if providers.json exists
    if (!fs.existsSync('./common/providers.json'))
        return false;

    // Check if providers.json is empty
    if (fs.readFileSync('./common/providers.json').length === 0)
        return false;
    
    // Check if providers.json is valid JSON
    try {
        providers = JSON.parse(fs.readFileSync('./common/providers.json'));
    }
    catch (error) {
        return false;
    }

    // Check if providers.json is according to .env's providers_quantity
    if (Object.keys(providers).length != config.providers_quantity)
        return false;

    return true;
};

exports.generateProviders = () => {

    // Creates a providers.json file with config defined quantity of random providers
    let providers = {};

    for (let i = 0; i < config.providers_quantity; i++) {
        providers[`example-${i}`] = {
            's200': 30 + Math.floor(Math.random() * 70),
            's404': Math.floor(Math.random() * 100),
            's500': Math.floor(Math.random() * 100),
            's503': Math.floor(Math.random() * 100),
            'MO': 90 + Math.floor(Math.random() * 10),
            'default': Math.floor(Math.random() * 100),
        };
    }

    fs.writeFileSync('./common/providers.json', JSON.stringify(providers));
};

exports.postProviders = () => {

    const log_responses = (config.log_responses == 'yes' || config.log_responses == 'y');

    // Posts each provider to the API
    let providers = JSON.parse(fs.readFileSync('./common/providers.json'));

    for (let provider in providers) {
        axios.post(`http://${api.host}:${api.port}/providers`, {
            code: provider,
            s200: providers[provider]['s200'],
            s404: providers[provider]['s404'],
            s500: providers[provider]['s500'],
            s503: providers[provider]['s503'],
            MO: providers[provider]['MO'],
            default: providers[provider]['default'],
        })
        .then((response) => {
            if (log_responses) console.log(response.data);
        })
        .catch((error) => {
            if (log_responses) console.log(error);
        });
    }
};

exports.checkNumbers = () => {

    let numbers;

    // Check if numbers.txt exists
    if (!fs.existsSync('./common/numbers1.txt'))
        return false;

    // Check if numbers.txt is empty
    if (fs.readFileSync('./common/numbers1.txt').length === 0)
        return false;

    // Check if numbers.txt is in format Number|Leverage
    try {
        numbers = fs.readFileSync('./common/numbers1.txt').toString().split('\n');
    }
    catch (error) {
        return false;
    }

    // Check if numbers.txt is according to .env's numbers_quantity
    if (numbers.length != config.numbers_quantity && numbers.length != file_limit)
        return false;

    for (let number of numbers) {
        if (number.split('|').length !== 2)
            return false;
    }

    return true;
};

exports.generateNumbers = () => {

    // Creates a numbers.txt file with 100 random numbers
    let counter = page_counter = 1;
    const ddd_list = db.getDDDs();
    const status_list = [
        's200',
        's404',
        's500',
        's503',
        'default',
    ];

    while (page_counter <= files_quantity) {

        let numbers = '';

        // Number format: +55XX9[8-9]XXXXXXX|Leverage
        for (let i = 0; i < config.numbers_quantity; i++) {

            const ddd = ddd_list[Math.floor(Math.random() * ddd_list.length)];
            const prefix = Math.floor(Math.random() * 2) + 8;
            const number = Math.floor(Math.random() * 9_000_000) + 1_000_000;
            const leverage = status_list[Math.floor(Math.random() * status_list.length)];

            numbers += `55${ddd}9${prefix}${number}|${leverage}\n`;

            if (i == file_limit)
                break;
        }

        fs.writeFileSync(`./common/numbers${page_counter}.txt`, numbers);
        numbers = '';

        // Remove last \n
        fs.writeFileSync(`./common/numbers${page_counter}.txt`, fs.readFileSync(`./common/numbers${page_counter}.txt`).toString().slice(0, -1));

        page_counter++;
    }
};

exports.generateSmsList = async () => {

    // Gets numbers and providers, then creates an array with config defined quantity of sms to be posted to the API
    let sms_list = [];

    const platforms = "DP|BF|KHOMP|MERA";
    let providers = JSON.parse(fs.readFileSync('./common/providers.json'));
    let file = Math.ceil(Math.random() * files_quantity);
    let numbers = fs.readFileSync(`./common/numbers${file}.txt`).toString().split('\n');
    providers = Object.fromEntries(Object.entries(providers).map(([provider, {MO, ...rest}]) => [provider, rest]));

    for (let i = 0; i < config.sms_quantity; i++) {

        const [number, leverage] = numbers[Math.floor(Math.random() * numbers.length)].split('|');
        const provider = Object.keys(providers)[Math.floor(Math.random() * Object.keys(providers).length)];
        const platform = platforms.split('|')[Math.floor(Math.random() * platforms.split('|').length)];

        const status_list = providers[provider];
        let status = Object.keys(status_list)[Math.floor(Math.random() * Object.keys(status_list).length)];

        const use_leverage = Math.floor(Math.random() * 3) < 2;
        
        if (use_leverage)
            status = leverage;

        const is_mo = status == 's200' && Math.floor(Math.random() * 100) == 1;
        
        if (is_mo)
            status = 'MO';

        sms_list.push({
            numero: number,
            plataforma: platform,
            fornecedor: provider,
            status: status,
        });
    }

    return sms_list;
};

exports.postSmsList = (sms_list) => {

    const log_responses = (config.log_responses == 'yes' || config.log_responses == 'y');

    for (let sms of sms_list) {

        axios.post(`http://${api.host}:${api.port}/add-to-rank`, sms)
        .then((response) => {
            if (log_responses)
                console.log(response.data);
        })
        .catch((error) => {
            if (log_responses)
                console.log(error);

            return false;
        });
    }
    return true;
};

exports.setConfig = (new_config) => {

    config = {...config, ...new_config};
};
