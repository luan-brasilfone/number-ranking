<?php

$providers = json_decode(file_get_contents('../common/providers.json'), true);

$quantity = 1000;

$minDelay = 10;
$maxDelay = 60;

$minSms = 1000;
$maxSms = 10000;


$status = [
    's200',
    's404',
    's500',
    's503',
    'default'
];

function generateNumbers ()
{
    global $quantity;
    global $status;

    for ($i = 0; $i < $quantity; $i++){

        $number = 0;
        do{
            $number = '55';
            $number .= rand(11, 99);
            $number .= 9;
            $number .= rand(8, 9);
            $number .= rand(100, 999);
            $number .= rand(1000, 9999);
        } while (isset($numbers[$number]));

        $number_leverage = $status[array_rand($status)];

        if (rand(1, 3) == 1) $number_leverage = 's200';

        $numbers[] = "$number/$number_leverage";
    }

    file_put_contents('../common/numbers.txt', implode(PHP_EOL, $numbers));
}

function generateProviders ()
{
    global $quantity;

    $providers = array();

    for ($i = 0; $i < $quantity; $i++){

        $code = 'example-';
        $code .= $i;

        $providers[$code] = [
            's200' => rand(30, 100),
            's404' => rand(0, 100),
            's500' => rand(0, 100),
            's503' => rand(0, 100),
            'MO' => rand(90, 100),
            'default' => rand(0, 100)
        ];
    }

    file_put_contents('../common/providers.json', json_encode($providers));
}

function postProviders ()
{
    global $providers;

    foreach ($providers as $key => $provider){
        $provider["code"] = $key;

        $curl = curl_init();
    
        curl_setopt_array($curl, array(
            CURLOPT_URL => 'localhost:3000/providers',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS =>json_encode($provider),
            CURLOPT_HTTPHEADER => array(
                'Content-Type: application/json'
            ),
        ));
    
        $response = curl_exec($curl);
    
        curl_close($curl);
        echo $response . PHP_EOL;
    }
}

function generateSms ($quantity = false)
{
    $plataforma = "DP|BF|INVALID_NUMBER|KHOMP";
    global $providers;

    if (!$quantity) global $quantity;

    $numbers = file_get_contents('../common/numbers.txt');
    $numbers = explode(PHP_EOL, $numbers);

    $smsList = [];

    echo PHP_EOL . "PHP: GERANDO $quantity SMS" . PHP_EOL . PHP_EOL;
    $mo = 0;
    for($i = 0; $i < $quantity; $i++){
        $providerNumber = array_rand($providers);
        $provider = $providers[$providerNumber];

        $key = $numbers[array_rand($numbers)];

        $number = explode('/', $key)[0];
        $number_leverage = explode('/', $key)[1];

        unset($provider['MO']);

        $sms_status = array_rand($provider);

        // echo "status gerado: " . $sms_status;
        if(isset($number_leverage)) rand(0, 1)? $sms_status = $number_leverage: $sms_status;
        // echo " | status mantido: $sms_status" . PHP_EOL;

        if ($sms_status == 's200' && rand(1, 100) == 1) $sms_status = 'MO';
        if ($sms_status == 'MO') $mo++;

        $sms = [
            'fornecedor' => $providerNumber,
            'status' => $sms_status,
            'numero' => $number,
            'plataforma' => $plataforma
        ];

        array_push($smsList, $sms);
        // echo "fornecedor: {$sms['fornecedor']} | numero: {$sms['numero']}" . PHP_EOL . PHP_EOL;
    }
    // echo PHP_EOL . "PHP: FIM DA GERAÇÃO DE SMS" . PHP_EOL . PHP_EOL;

    return [$smsList, $mo, $quantity];
}

function main($params) {
    $smsList = $params[0];
    $mo = $params[1];
    $quantity = $params[2];

    if (!$quantity) global $quantity;

    echo "PHP: POSTANDO $quantity | $mo MOs GERADAS " . PHP_EOL;
    foreach ($smsList as $sms){
        $curl = curl_init();
    
        curl_setopt_array($curl, array(
            CURLOPT_URL => 'localhost:3000/add-to-rank',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS =>'{"numero":"'.$sms['numero'].'","fornecedor":"'.$sms['fornecedor'].'","plataforma":"'.$sms['plataforma'].'","status":"'.$sms['status'].'"}',
            CURLOPT_HTTPHEADER => array(
                'Content-Type: application/json'
            ),
        ));
    
        $response = curl_exec($curl);
    
        curl_close($curl);
        // echo $response . PHP_EOL;
    }
}

function service() {

    global $minDelay;
    global $maxDelay;
    global $minSms;
    global $maxSms;

    while (true) {

        main(generateSms(rand($minSms, $maxSms)));
        sleep(rand($minDelay, $maxDelay));
    }
}

// main(generateSms());
// generateNumbers();
// generateProviders();
// postProviders();
service();