/**
 * Admin Setup Script
 * Run this once to set a user as admin
 * Usage: Open browser console and run: await makeUserAdmin('apelover69')
 */

import { app } from './firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js';

/**
 * Make a user an admin by username using Cloud Function
 * @param {string} username - The username to make admin
 */
export async function makeUserAdmin(username) {
    try {
        console.log(`Making user "${username}" an admin...`);
        
        const functions = getFunctions(app, 'us-central1');
        const makeUserAdminFunction = httpsCallable(functions, 'makeUserAdmin');
        
        const result = await makeUserAdminFunction({ username });
        
        console.log(`✅ Successfully set "${username}" as admin!`);
        console.log('Result:', result.data);
        return result.data;
    } catch (error) {
        console.error('Error making user admin:', error);
        if (error.code === 'functions/not-found') {
            console.error('Cloud Function not found. Make sure you have deployed the functions.');
        }
        throw error;
    }
}

// Make it available globally for console use
if (typeof window !== 'undefined') {
    window.makeUserAdmin = makeUserAdmin;
    console.log('Admin setup script loaded. Run: await makeUserAdmin("apelover69")');
}

