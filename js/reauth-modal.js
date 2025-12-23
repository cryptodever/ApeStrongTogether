/**
 * Reauthentication Modal Module
 * Handles reauthentication for sensitive operations (change password, email, delete account)
 */

import { auth } from './firebase.js';
import { 
    reauthenticateWithCredential,
    EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

let reauthModal = null;
let reauthResolve = null;
let reauthReject = null;

/**
 * Inject reauth modal styles
 */
function injectReauthStyles() {
    if (document.getElementById('reauth-modal-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'reauth-modal-styles';
    style.textContent = `
        .reauth-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 2rem;
        }

        .reauth-modal {
            background: rgba(26, 26, 26, 0.95);
            border: 0.5px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            max-width: 450px;
            width: 100%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            position: relative;
            animation: modalSlideIn 0.3s ease;
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .reauth-modal-content {
            padding: 2rem;
        }

        .reauth-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .reauth-modal-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: #ffffff;
            margin: 0;
            font-family: 'Space Grotesk', 'Inter', sans-serif;
        }

        .reauth-modal-close {
            background: transparent;
            border: none;
            color: #d0d0d0;
            font-size: 1.75rem;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
            line-height: 1;
        }

        .reauth-modal-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        .reauth-modal-body {
            margin-bottom: 1.5rem;
        }

        .reauth-modal-message {
            color: #d0d0d0;
            margin-bottom: 1.5rem;
            line-height: 1.6;
            font-size: 0.95rem;
        }

        .reauth-form-group {
            margin-bottom: 1rem;
        }

        .reauth-form-group label {
            display: block;
            font-size: 0.9rem;
            color: #d0d0d0;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        .reauth-input {
            width: 100%;
            padding: 0.75rem;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            font-size: 0.95rem;
            transition: all 0.3s ease;
            box-sizing: border-box;
        }

        .reauth-input:focus {
            outline: none;
            border-color: #4ade80;
            box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.2);
        }

        .reauth-message {
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }

        .reauth-error {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.5);
            color: #fca5a5;
        }

        .reauth-modal-footer {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
        }

        .reauth-btn {
            padding: 0.75rem 1.5rem;
            font-size: 0.95rem;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Inter', sans-serif;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .reauth-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        .reauth-btn-primary {
            background: linear-gradient(135deg, #4ade80, #22c55e);
            color: #000;
            box-shadow: 0 4px 16px rgba(74, 222, 128, 0.4);
        }

        .reauth-btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 24px rgba(74, 222, 128, 0.5);
        }

        .reauth-btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .reauth-btn-secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
            transform: translateY(-2px);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Create reauthentication modal HTML
 */
function createReauthModal() {
    if (document.getElementById('reauthModal')) {
        return;
    }

    injectReauthStyles();

    const modalHTML = `
        <div id="reauthModalBackdrop" class="reauth-modal-backdrop hide">
            <div id="reauthModal" class="reauth-modal">
                <div class="reauth-modal-content">
                    <div class="reauth-modal-header">
                        <h2 class="reauth-modal-title">Reauthenticate</h2>
                        <button id="reauthModalClose" class="reauth-modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="reauth-modal-body">
                        <p class="reauth-modal-message" id="reauthModalMessage">
                            Please enter your password to continue with this action.
                        </p>
                        <div id="reauthError" class="reauth-message reauth-error hide"></div>
                        <div class="reauth-form-group">
                            <label for="reauthPassword">Password</label>
                            <input 
                                type="password" 
                                id="reauthPassword" 
                                class="reauth-input"
                                placeholder="Enter your password"
                                autocomplete="current-password"
                            />
                        </div>
                    </div>
                    <div class="reauth-modal-footer">
                        <button id="reauthCancelBtn" class="reauth-btn reauth-btn-secondary">Cancel</button>
                        <button id="reauthConfirmBtn" class="reauth-btn reauth-btn-primary">Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    reauthModal = {
        backdrop: document.getElementById('reauthModalBackdrop'),
        modal: document.getElementById('reauthModal'),
        closeBtn: document.getElementById('reauthModalClose'),
        cancelBtn: document.getElementById('reauthCancelBtn'),
        confirmBtn: document.getElementById('reauthConfirmBtn'),
        passwordInput: document.getElementById('reauthPassword'),
        errorMsg: document.getElementById('reauthError'),
        message: document.getElementById('reauthModalMessage')
    };

    setupReauthModalEvents();
}

/**
 * Setup event listeners for reauth modal
 */
function setupReauthModalEvents() {
    if (!reauthModal) return;

    // Close on backdrop click
    reauthModal.backdrop.addEventListener('click', (e) => {
        if (e.target === reauthModal.backdrop) {
            closeReauthModal(false);
        }
    });

    // Close on close button
    reauthModal.closeBtn.addEventListener('click', () => {
        closeReauthModal(false);
    });

    // Cancel button
    reauthModal.cancelBtn.addEventListener('click', () => {
        closeReauthModal(false);
    });

    // Confirm button
    reauthModal.confirmBtn.addEventListener('click', handleReauthConfirm);

    // Enter key on password input
    reauthModal.passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleReauthConfirm();
        }
    });
}

/**
 * Show reauthentication modal
 * @param {string} message - Optional custom message
 * @returns {Promise<boolean>} Resolves to true if reauthentication succeeded, false if cancelled
 */
export function showReauthModal(message = null) {
    return new Promise((resolve, reject) => {
        // Ensure modal exists
        createReauthModal();

        // Set custom message if provided
        if (message && reauthModal.message) {
            reauthModal.message.textContent = message;
        } else if (reauthModal.message) {
            reauthModal.message.textContent = 'Please enter your password to continue with this action.';
        }

        // Reset form
        if (reauthModal.passwordInput) {
            reauthModal.passwordInput.value = '';
        }
        hideError();

        // Store resolve/reject
        reauthResolve = resolve;
        reauthReject = reject;

        // Show modal
        reauthModal.backdrop.classList.remove('hide');
        reauthModal.backdrop.classList.add('show-flex');
        reauthModal.modal.classList.remove('hide');
        reauthModal.modal.classList.add('show');
        
        // Focus password input
        setTimeout(() => {
            if (reauthModal.passwordInput) {
                reauthModal.passwordInput.focus();
            }
        }, 100);
    });
}

/**
 * Close reauthentication modal
 * @param {boolean} success - Whether reauthentication was successful
 */
function closeReauthModal(success) {
    if (!reauthModal) return;

    reauthModal.backdrop.classList.add('hide');
    reauthModal.backdrop.classList.remove('show-flex');
    reauthModal.modal.classList.add('hide');
    reauthModal.modal.classList.remove('show');
    
    // Clear password
    if (reauthModal.passwordInput) {
        reauthModal.passwordInput.value = '';
    }
    hideError();

    // Resolve promise
    if (reauthResolve) {
        reauthResolve(success);
        reauthResolve = null;
        reauthReject = null;
    }
}

/**
 * Show error message
 */
function showError(message) {
    if (reauthModal && reauthModal.errorMsg) {
        reauthModal.errorMsg.textContent = message;
        reauthModal.errorMsg.classList.remove('hide');
        reauthModal.errorMsg.classList.add('show');
    }
}

/**
 * Hide error message
 */
function hideError() {
    if (reauthModal && reauthModal.errorMsg) {
        reauthModal.errorMsg.classList.add('hide');
        reauthModal.errorMsg.classList.remove('show');
        reauthModal.errorMsg.textContent = '';
    }
}

/**
 * Handle reauthentication confirmation
 */
async function handleReauthConfirm() {
    const user = auth.currentUser;
    const password = reauthModal.passwordInput.value;

    if (!user) {
        showError('No user logged in.');
        return;
    }

    if (!password) {
        showError('Please enter your password.');
        reauthModal.passwordInput.focus();
        return;
    }

    if (!user.email) {
        showError('User email not found. Cannot reauthenticate.');
        return;
    }

    try {
        // Disable button
        reauthModal.confirmBtn.disabled = true;
        reauthModal.confirmBtn.textContent = 'Verifying...';

        // Create credential
        const credential = EmailAuthProvider.credential(user.email, password);

        // Reauthenticate
        await reauthenticateWithCredential(user, credential);

        console.log('Reauthentication successful');
        closeReauthModal(true);
    } catch (error) {
        console.error('Reauthentication error:', error);
        
        // Re-enable button
        reauthModal.confirmBtn.disabled = false;
        reauthModal.confirmBtn.textContent = 'Confirm';

        // Show error
        let errorMessage = 'Reauthentication failed. ';
        if (error.code === 'auth/wrong-password') {
            errorMessage += 'Incorrect password.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage += 'Incorrect password.';
        } else if (error.code === 'auth/user-mismatch') {
            errorMessage += 'User mismatch.';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage += 'User not found.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage += 'Network error. Please try again.';
        } else {
            errorMessage += error.message || 'Please try again.';
        }
        showError(errorMessage);
        reauthModal.passwordInput.focus();
        reauthModal.passwordInput.select();
    }
}

/**
 * Helper function to reauthenticate before performing sensitive operation
 * @param {string} message - Optional custom message
 * @returns {Promise<boolean>} True if reauthenticated successfully
 */
export async function requireReauth(message = null) {
    return await showReauthModal(message);
}

