// Firebase Configuration
// Configuration for Kopi Kap project
// Credentials extracted from google-services.json

const firebaseConfig = {
    apiKey: "AIzaSyD9EMyZgu7FsJOwzYB59DxdAJYTK5mwZqc",
    authDomain: "finalyearproject-b3787.firebaseapp.com",
    projectId: "finalyearproject-b3787",
    storageBucket: "finalyearproject-b3787.firebasestorage.app",
    messagingSenderId: "581749071416",
    appId: "1:581749071416:android:ea60d7d3b7f238fa49d0cd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services conditionally
// Auth is only needed for authenticated pages (dashboard, profile, etc.)
// Firestore is always needed
let auth = null;
let db = null;

try {
    // Check if auth SDK is loaded (optional for kiosk display)
    if (typeof firebase.auth === 'function') {
        auth = firebase.auth();
        console.log('✅ Firebase Auth initialized');
    } else {
        console.log('ℹ️  Firebase Auth SDK not loaded (not required for this page)');
    }
} catch (e) {
    console.log('ℹ️  Firebase Auth not available:', e.message);
}

try {
    // Firestore is required for all pages
    db = firebase.firestore();
    console.log('✅ Firebase Firestore initialized');
} catch (e) {
    console.error('❌ Firebase Firestore initialization failed:', e);
}

// Export for use in other files
window.auth = auth;
window.db = db;

console.log('🔥 Firebase initialized successfully');
