const config = require('../../config/simulation');

const api = require('../../config/api');
const fs = require('fs');
const axios = require('axios');

exports.checkProviders = () => {

    // Check if providers.json exists
    if (!fs.existsSync('../common/providers.json')) return false;

    // Check if providers.json is empty
    if (fs.readFileSync('../common/providers.json').length === 0) return false;

    // Check if providers.json is valid JSON
    try {
        JSON.parse(fs.readFileSync('../common/providers.json'));
    }
    catch (error) {
        return false;
    }

    return true;
};

exports.generateProviders = () => {

    // Creates a providers.json file with 100 random providers
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

    fs.writeFileSync('../common/providers.json', JSON.stringify(providers));
};

exports.postProviders = () => {

    const log_responses = (config.log_responses == 'yes' || config.log_responses == 'y');

    // Posts each provider to the API
    let providers = JSON.parse(fs.readFileSync('../common/providers.json'));

    for (let provider in providers) {
        axios.post(`${api.host}:${api.port}/providers`, {
            provider: provider,
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

    // Check if numbers.txt exists
    if (!fs.existsSync('../common/numbers.txt')) return false;

    // Check if numbers.txt is empty
    if (fs.readFileSync('../common/numbers.txt').length === 0) return false;

    // Check if numbers.txt is in format Number|Leverage
    let numbers = fs.readFileSync('../common/numbers.txt').toString().split('\n');

    for (let number of numbers) {
        if (number.split('|').length !== 2) return false;
    }

    return true;
};

exports.generateNumbers = () => {

    // Creates a numbers.txt file with 100 random numbers
    let numbers = '';
    const status_list = [
        's200',
        's404',
        's500',
        's503',
        'default',
    ];

    // Number format: +55XX9[8-9]XXXXXXX|Leverage
    for (let i = 0; i < config.numbers_quantity; i++) {

        const ddd = Math.floor(Math.random() * 100);
        const prefix = Math.floor(Math.random() * 2) + 8;
        const number = Math.floor(Math.random() * 10000000);
        const leverage = status_list[Math.floor(Math.random() * status_list.length)];

        numbers += `+55${ddd}9${prefix}${number}|${leverage}\n`;
    }

    fs.writeFileSync('../common/numbers.txt', numbers);
};

exports.generateSmsList = () => {

    // Gets numbers and providers, then creates an array with config defined quantity of sms to be posted to the API
    let sms_list = [];
    
    const numbers = fs.readFileSync('../common/numbers.txt').toString().split('\n');
    const providers = JSON.parse(fs.readFileSync('../common/providers.json'));
    
    const platforms = "DP|BF|KHOMP";
    
    for (let i = 0; i < config.sms_quantity; i++) {
        
        const [number, leverage] = numbers[Math.floor(Math.random() * numbers.length)].split('|');
        const provider = Object.keys(providers)[Math.floor(Math.random() * Object.keys(providers).length)];
        const status = provider[Math.floor(Math.random() * provider.length)];
        const platform = platforms.split('|')[Math.floor(Math.random() * platforms.split('|').length)];

        const use_leverage = Math.floor(Math.random() * 3) < 2;
        const is_mo = status == 's200' && Math.floor(Math.random() * 100) == 1;
        
        if (use_leverage) status = leverage;
        if (is_mo) status = 'MO';

        sms_list.push({
            numero: number,
            plataforma: platform,
            fornecedor: provider,
            status: status,
        });

        return sms_list;
    }
};

exports.postSmsList = (sms_list) => {

    const log_responses = (config.log_responses == 'yes' || config.log_responses == 'y');

    for (let sms of sms_list) {
        axios.post(`${api.host}:${api.port}/add-to-rank`, sms)
        .then((response) => {
            if (log_responses) console.log(response.data);
        })
        .catch((error) => {
            if (log_responses) console.log(error);
        });
    }
};
