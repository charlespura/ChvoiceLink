<?php
// Local-only helper for XAMPP/Apache.
// Reads `.env` and outputs JS setting `globalThis.__FIREBASE_CONFIG__`.
// Not used on GitHub Pages.

header('Content-Type: application/javascript; charset=utf-8');

$root = __DIR__;
$envPath = $root . DIRECTORY_SEPARATOR . '.env';

function parse_env_file($contents) {
  $out = [];
  $lines = preg_split("/\\r\\n|\\n|\\r/", $contents);
  foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#')) continue;
    $eq = strpos($line, '=');
    if ($eq === false) continue;
    $key = trim(substr($line, 0, $eq));
    $val = trim(substr($line, $eq + 1));
    if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
      $val = substr($val, 1, -1);
    }
    $out[$key] = $val;
  }
  return $out;
}

if (!file_exists($envPath)) {
  http_response_code(404);
  echo "console.error('Missing .env file. Copy .env.example to .env and fill values.');\n";
  exit;
}

$env = parse_env_file(file_get_contents($envPath));
$required = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_MEASUREMENT_ID',
];

$missing = [];
foreach ($required as $k) {
  if (!isset($env[$k]) || $env[$k] === '') $missing[] = $k;
}

if (count($missing) > 0) {
  http_response_code(400);
  $msg = 'Missing keys in .env: ' . implode(', ', $missing);
  echo "console.error(" . json_encode($msg) . ");\n";
  exit;
}

$config = [
  'apiKey' => $env['FIREBASE_API_KEY'],
  'authDomain' => $env['FIREBASE_AUTH_DOMAIN'],
  'projectId' => $env['FIREBASE_PROJECT_ID'],
  'storageBucket' => $env['FIREBASE_STORAGE_BUCKET'],
  'messagingSenderId' => $env['FIREBASE_MESSAGING_SENDER_ID'],
  'appId' => $env['FIREBASE_APP_ID'],
  'measurementId' => $env['FIREBASE_MEASUREMENT_ID'],
];

echo "globalThis.__FIREBASE_CONFIG__ = " . json_encode($config, JSON_UNESCAPED_SLASHES) . ";\n";
