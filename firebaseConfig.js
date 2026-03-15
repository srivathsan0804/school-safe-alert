import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // This allows us to use the Realtime Database

// These values tell the app WHICH database to talk to
const firebaseConfig = {
  apiKey: "AIzaSyCgkGQTLeSPQAXENul5Iw1ovNIK8PojakA",
  authDomain: "school-safe-alert.firebaseapp.com",
  databaseURL: "https://school-safe-alert-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-safe-alert",
  storageBucket: "school-safe-alert.appspot.com",
  messagingSenderId: "464672366786",
  appId: "1:464672366786:web:d4c6b4e59923be2ec5db5b"
};

// Initialize the Firebase App
const app = initializeApp(firebaseConfig);

// Create a database reference and export it so other files can use it
export const database = getDatabase(app);