import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCbFuTY-mMdA0BwZqtl8Al7mB0i3llYd4Q",
  authDomain: "hanasi-2b38e.firebaseapp.com",
  databaseURL: "https://hanasi-2b38e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hanasi-2b38e",
  storageBucket: "hanasi-2b38e.firebasestorage.app",
  messagingSenderId: "842293735473",
  appId: "1:842293735473:web:df0add0b66073fd2a52510"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
