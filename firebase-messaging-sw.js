importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCc4Y8E53Ys9O6EOuIrd4NH_W6OWHw_ut3k",
  authDomain: "ksn1ks.firebaseapp.com",
  projectId: "ksn1ks",
  storageBucket: "ksn1ks.firebasestorage.app",
  messagingSenderId: "284824400796",
  appId: "1:284824400796:web:120c6c2076df833c34e59"
});

const messaging = firebase.messaging();