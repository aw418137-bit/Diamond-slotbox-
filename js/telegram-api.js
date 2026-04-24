// Telegram API Integration
class TelegramAPI {
    static CLIENT_ID = '8366149718';
    static CLIENT_SECRET = 'nMMnd4XKxOfK_-LK4e3YlQ9eFNWqDSzvwRAoMGi0BqHhxJItZPg4pQ';

    static login(callback) {
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const user = window.Telegram.WebApp.initDataUnsafe.user;
            callback(user);
        } else {
            // Fallback for development
            alert('Please open this app through Telegram');
        }
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
