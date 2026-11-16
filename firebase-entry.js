import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, push, get, onValue, query, orderByChild, startAt, onDisconnect, serverTimestamp, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, getIdTokenResult, sendPasswordResetEmail, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
window.ExpressFirebase = { initializeApp, getDatabase, ref, set, update, push, get, onValue, query, orderByChild, startAt, onDisconnect, serverTimestamp,
 getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, getIdTokenResult, sendPasswordResetEmail, getFunctions, httpsCallable,
 connectDatabaseEmulator, connectAuthEmulator, connectFunctionsEmulator };
