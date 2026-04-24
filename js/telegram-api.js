// Telegram API Integration
class TelegramAPI {
    static CLIENT_ID = '8366149718';
    static CLIENT_SECRET = 'nMMnd4XKxOfK_-LK4e3YlQ9eFNWqDSzvwRAoMGi0BqHhxJItZPg4pQ';

    static login(callback) {
        // First check if user is already authenticated via Telegram
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const user = window.Telegram.WebApp.initDataUnsafe.user;
            console.log('✅ User authenticated via Telegram:', user);
            callback(user);
            return true;
        }

        // Fallback: Check if already logged in via localStorage
        const storedUser = localStorage.getItem('telegramUser');
        if (storedUser) {
            console.log('✅ User loaded from localStorage');
            callback(JSON.parse(storedUser));
            return true;
        }

        // Show login button if not authenticated
        console.warn('⚠️ Not in Telegram WebApp. Show login button.');
        TelegramAPI.showLoginPrompt(callback);
        return false;
    }

    static showLoginPrompt(callback) {
        // Create login container
        const loginContainer = document.getElementById('telegram-login-container');
        if (!loginContainer) {
            console.error('No #telegram-login-container found in HTML');
            alert('Please open this app through Telegram Bot or login below');
            return;
        }

        // Create login button
        const loginBtn = document.createElement('button');
        loginBtn.id = 'telegram-login-btn';
        loginBtn.textContent = '🔐 Login with Telegram';
        loginBtn.style.cssText = `
            padding: 12px 24px;
            font-size: 16px;
            background: #0088cc;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            width: 100%;
            max-width: 300px;
            margin: 20px auto;
            display: block;
        `;

        loginBtn.onclick = () => TelegramAPI.openLoginWidget(callback);
        loginContainer.innerHTML = '';
        loginContainer.appendChild(loginBtn);

        // Inject Telegram login script
        if (!document.getElementById('telegram-login-script')) {
            const script = document.createElement('script');
            script.id = 'telegram-login-script';
            script.async = true;
            script.src = 'https://telegram.org/js/telegram-widget.js?8';
            document.head.appendChild(script);
        }
    }

    static openLoginWidget(callback) {
        // Use Telegram Web Login widget
        // This requires setting up OAuth with Telegram
        const botUsername = 'diamondslotbox_bot'; // Replace with your bot username
        const redirectUrl = window.location.origin;

        // Method 1: Telegram Login Widget (recommended)
        const loginUrl = `https://telegram.me/${botUsername}?start=login`;
        
        // Open in new window/tab
        const popup = window.open(
            loginUrl,
            'telegram-login',
            'width=500,height=600'
        );

        // Wait for popup to close and check localStorage
        const checkInterval = setInterval(() => {
            const user = localStorage.getItem('telegramUser');
            if (user) {
                clearInterval(checkInterval);
                if (popup) popup.close();
                callback(JSON.parse(user));
            }
        }, 500);

        // Clear interval after 5 minutes
        setTimeout(() => clearInterval(checkInterval), 300000);
    }

    static storeUser(user) {
        // Store user data after successful login
        localStorage.setItem('telegramUser', JSON.stringify(user));
        console.log('✅ User stored:', user);
    }

    static logout() {
        // Clear stored user data
        localStorage.removeItem('telegramUser');
        console.log('✅ User logged out');
        location.reload();
    }

    static async processStarPayment(stars, onSuccess, onError) {
        if (!window.Telegram?.WebApp) {
            const error = 'Telegram WebApp not available';
            onError?.(error);
            return false;
        }

        try {
            // Get user data for payment tracking
            const user = window.Telegram.WebApp.initDataUnsafe?.user;
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Create invoice payload
            const invoicePayload = JSON.stringify({
                user_id: user.id,
                username: user.username,
                stars: stars,
                timestamp: Date.now()
            });

            // Request payment from Telegram
            window.Telegram.WebApp.openInvoice(
                `/payment?payload=${encodeURIComponent(invoicePayload)}`,
                (status) => {
                    if (status === 'paid') {
                        // Payment successful - verify on backend
                        TelegramAPI.verifyPayment(stars, user.id)
                            .then(() => onSuccess?.())
                            .catch((err) => onError?.(err));
                    } else if (status === 'cancelled') {
                        onError?.('Payment cancelled by user');
                    } else if (status === 'failed') {
                        onError?.('Payment failed');
                    }
                }
            );
        } catch (error) {
            console.error('Payment error:', error);
            onError?.(error.message);
            return false;
        }
        return true;
    }

    static async verifyPayment(stars, userId) {
        try {
            const response = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.Telegram.WebApp.initData}`
                },
                body: JSON.stringify({
                    user_id: userId,
                    stars: stars
                })
            });

            if (!response.ok) {
                throw new Error('Payment verification failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Verification error:', error);
            throw error;
        }
    }

    static sendNotification(message) {
        if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert(message);
        }
    }

    static vibrate() {
        if (window.Telegram?.WebApp?.HapticFeedback?.impactOccurred) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        } else if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    static async sendBotMessage(message) {
        // This would be implemented on the bot backend
        console.log('Sending to bot:', message);
    }
}
