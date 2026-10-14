'use strict';

/**
 * Firebase-проект официального Anixart Android (из google-services / strings.xml).
 * Тот же apiKey, что в OAuth AnixApp — публичный клиентский ключ APK.
 */

const DEFAULT_API_KEY = 'AIzaSyBFPckWOsp0MEqb_1gwszvM1ILdUixM-uw';

function getFirebaseApiKey() {
  const fromEnv = String(process.env.FIREBASE_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const generated = require('./oauth-env.generated');
    const key = String(generated && generated.FIREBASE_API_KEY || '').trim();
    if (key) return key;
  } catch { /* ignore */ }
  return DEFAULT_API_KEY;
}

function getAnixartFirebaseConfig() {
  return {
    apiKey: getFirebaseApiKey(),
    appId: '1:983926366374:android:86c070d43af9c4cd0b5467',
    projectId: 'anime-ad-eb8b3',
    messagingSenderId: '983926366374',
    databaseURL: 'https://anime-ad-eb8b3.firebaseio.com',
    storageBucket: 'anime-ad-eb8b3.appspot.com',
  };
}

module.exports = {
  getAnixartFirebaseConfig,
  getFirebaseApiKey,
};
