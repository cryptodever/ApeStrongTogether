// Copy and paste this entire code into your browser console (F12) while logged into your site

(async () => {
    try {
        // Import Firebase Functions
        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js');
        
        // Get the Firebase app instance
        const { app } = await import('/js/firebase.js');
        
        // Initialize Functions
        const functions = getFunctions(app, 'us-central1');
        
        // Create the callable function
        const verifyEmail = httpsCallable(functions, 'verifyUserEmail');
        
        // Verify your friend's email
        console.log('Verifying email for UID: Gz1UdzwKuGUoKjGVuqt1yNSQcg33');
        const result = await verifyEmail({ uid: 'Gz1UdzwKuGUoKjGVuqt1yNSQcg33' });
        
        // Success!
        alert('✅ SUCCESS!\n\nEmail verified for: ' + result.data.email + '\n\nYour friend can now log in!');
        console.log('✅ Verification successful:', result.data);
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        let errorMessage = 'Unknown error';
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission denied. Make sure you have role: "admin" in your Firestore user document.';
        } else if (error.message) {
            errorMessage = error.message;
        } else if (error.code) {
            errorMessage = error.code;
        }
        
        alert('❌ ERROR:\n\n' + errorMessage + '\n\nCheck the console for more details.');
    }
})();

