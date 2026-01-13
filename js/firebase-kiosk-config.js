// Firebase Configuration for Kiosk Display
// This version does NOT load Auth SDK (not needed for public display)

const firebaseConfig = {
    apiKey: "AIzaSyD9EMyZgu7FsJOwzYB59DxdAJYTK5mwZqc",
    authDomain: "finalyearproject-b3787.firebaseapp.com",
    projectId: "finalyearproject-b3787",
    storageBucket: "finalyearproject-b3787.firebasestorage.app",
    messagingSenderId: "581749071416",
    appId: "1:581749071416:android:ea60d7d3b7f238fa49d0cd"
};

console.log('🔧 Initializing Firebase for Kiosk Display...');

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
console.log('✅ Firebase app initialized');

// Initialize Firestore only (no Auth needed for kiosk)
const db = firebase.firestore();
console.log('✅ Firestore initialized');

// Export to window for global access
window.db = db;
window.auth = null; // Auth not needed for kiosk

console.log('🔥 Firebase Kiosk Config loaded successfully');
console.log('📊 DB available:', !!db);
