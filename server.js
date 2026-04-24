const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files
app.use(express.static('public'));

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAYMENT_PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://yourdomain.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory stores (replace with database in production)
const userSessions = new Map();
const userPayments = new Map();
const userStars = new Map();
const userLogins = new Map();

// ==================== TELEGRAM VERIFICATION ====================

/**
 * Verify Telegram user with initData
 */
app.post('/api/verify-telegram', async (req, res) => {
    const { initData, userData } = req.body;
    
    try {
        if (!userData || !userData.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing user data' 
            });
        }
        
        const userId = userData.id;
        const sessionToken = generateSessionToken();
        
        // Store user session
        userSessions.set(userId, {
            token: sessionToken,
            user: {
                id: userData.id,
                firstName: userData.first_name,
                lastName: userData.last_name,
                username: userData.username,
                isPremium: userData.is_premium,
                photoUrl: userData.photo_url
            },
            loginTime: new Date(),
            lastActive: new Date(),
            verified: true
        });
        
        // Track login
        userLogins.set(userId, {
            timestamp: Date.now(),
            username: userData.username || `User${userId}`,
            isPremium: userData.is_premium
        });
        
        console.log(`✅ User verified: ${userData.username || userData.first_name}`);
        
        res.json({
            success: true,
            message: 'Telegram user verified',
            sessionToken: sessionToken,
            user: {
                id: userId,
                username: userData.username,
                firstName: userData.first_name
            }
        });
    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * Get user status
 */
app.get('/api/user-status/:userId', (req, res) => {
    const { userId } = req.params;
    const session = userSessions.get(parseInt(userId));
    
    if (!session) {
        return res.status(404).json({ 
            error: 'User session not found' 
        });
    }
    
    res.json({
        userId: userId,
        verified: session.verified,
        loginTime: session.loginTime,
        lastActive: session.lastActive,
        user: session.user
    });
});

// ==================== PAYMENT ENDPOINTS ====================

/**
 * Verify payment and credit stars
 */
app.post('/api/verify-payment', async (req, res) => {
    const { user_id, stars } = req.body;
    
    try {
        // Verify user session
        const session = userSessions.get(parseInt(user_id));
        if (!session || !session.verified) {
            return res.status(401).json({ 
                success: false,
                error: 'User not verified' 
            });
        }
        
        if (!user_id || !stars) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing user_id or stars' 
            });
        }
        
        // Credit stars to user
        const currentStars = userStars.get(user_id) || 0;
        userStars.set(user_id, currentStars + stars);
        
        // Track payment
        userPayments.set(`${user_id}_${Date.now()}`, {
            userId: user_id,
            stars: stars,
            timestamp: Date.now(),
            processed: true
        });
        
        console.log(`✅ Payment verified: User ${user_id} credited ${stars} stars`);
        
        res.json({
            success: true,
            message: 'Payment verified and credited',
            user_id: user_id,
            stars: stars,
            total_stars: userStars.get(user_id)
        });
    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get user's star balance
 */
app.get('/api/user-balance/:userId', (req, res) => {
    const { userId } = req.params;
    const balance = userStars.get(userId) || 0;
    
    res.json({
        user_id: userId,
        stars: balance
    });
});

// ==================== INVOICE ENDPOINTS ====================

/**
 * Create and send invoice
 */
app.post('/payment', async (req, res) => {
    const { payload } = req.query;
    
    try {
        if (!payload) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing payload' 
            });
        }
        
        const data = JSON.parse(decodeURIComponent(payload));
        const { user_id, stars, username } = data;
        
        // Verify user session
        const session = userSessions.get(parseInt(user_id));
        if (!session || !session.verified) {
            return res.status(401).json({ 
                success: false,
                error: 'User not verified' 
            });
        }
        
        // Create invoice
        await bot.sendInvoice(
            user_id,
            'Diamond Slots Stars',
            `Purchase ${stars} Telegram Stars`,
            JSON.stringify({ user_id, stars }),
            PAYMENT_PROVIDER_TOKEN,
            'XTR', // Telegram Stars currency
            [{ label: `${stars} Stars`, amount: stars }]
        );
        
        res.json({ 
            success: true, 
            message: 'Invoice sent' 
        });
    } catch (error) {
        console.error('❌ Invoice error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ==================== TELEGRAM BOT HANDLERS ====================

/**
 * Handle successful payment
 */
bot.on('successful_payment', async (msg) => {
    const { successful_payment } = msg;
    const userId = msg.from.id;
    const stars = successful_payment.total_amount;
    
    // Credit stars
    const currentStars = userStars.get(userId) || 0;
    userStars.set(userId, currentStars + stars);
    
    // Send confirmation
    bot.sendMessage(
        userId,
        `✅ Payment successful!\n\n⭐ You received ${stars} Telegram Stars\n\nTotal Stars: ${userStars.get(userId)}`
    );
    
    console.log(`💰 Payment received: User ${userId} paid ${stars} stars`);
});

/**
 * Handle pre-checkout queries
 */
bot.on('pre_checkout_query', async (query) => {
    const { id } = query;
    
    // Approve payment
    bot.answerPreCheckoutQuery(id, true);
});

/**
 * Handle /start command
 */
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const userBalance = userStars.get(userId) || 0;
    
    // Store login info
    userLogins.set(userId, {
        timestamp: Date.now(),
        username: username,
        isPremium: msg.from.is_premium || false
    });
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '⭐ Buy Stars', callback_data: 'buy_stars' }],
            [{ text: '🎰 Play Game', callback_data: 'play_game' }],
            [{ text: '💰 Check Balance', callback_data: 'check_balance' }],
            [{ text: '📱 Open Mini App', url: process.env.WEBAPP_URL || 'https://your-app.com' }]
        ]
    };
    
    bot.sendMessage(
        chatId,
        `🎰 Welcome to Diamond Slots!\n\n👤 ${username}\n⭐ Your balance: ${userBalance} stars`,
        { reply_markup: keyboard }
    );
    
    console.log(`🎮 User started: ${username} (ID: ${userId})`);
});

/**
 * Handle callback queries
 */
bot.on('callback_query', async (query) => {
    const { id, from, data } = query;
    const userId = from.id;
    const chatId = query.message.chat.id;
    
    if (data === 'buy_stars') {
        const starPackages = {
            inline_keyboard: [
                [{ text: '10 ⭐ = $1', callback_data: 'buy_10' }],
                [{ text: '50 ⭐ = $5', callback_data: 'buy_50' }],
                [{ text: '100 ⭐ = $10', callback_data: 'buy_100' }],
                [{ text: 'Back', callback_data: 'back' }]
            ]
        };
        
        bot.editMessageText(
            'Select a star package:',
            { 
                chat_id: chatId, 
                message_id: query.message.message_id, 
                reply_markup: starPackages 
            }
        );
    } else if (data.startsWith('buy_')) {
        const amount = parseInt(data.split('_')[1]);
        
        // Send invoice
        await bot.sendInvoice(
            chatId,
            'Diamond Slots Stars',
            `Purchase ${amount} Telegram Stars`,
            JSON.stringify({ user_id: userId, stars: amount }),
            PAYMENT_PROVIDER_TOKEN,
            'XTR',
            [{ label: `${amount} Stars`, amount }]
        );
    } else if (data === 'check_balance') {
        const balance = userStars.get(userId) || 0;
        bot.answerCallbackQuery(id, `💰 Your balance: ⭐ ${balance} stars`, true);
    } else if (data === 'back') {
        const balance = userStars.get(userId) || 0;
        const username = from.username || from.first_name;
        const keyboard = {
            inline_keyboard: [
                [{ text: '⭐ Buy Stars', callback_data: 'buy_stars' }],
                [{ text: '🎰 Play Game', callback_data: 'play_game' }],
                [{ text: '💰 Check Balance', callback_data: 'check_balance' }]
            ]
        };
        
        bot.editMessageText(
            `🎰 Welcome to Diamond Slots!\n\n👤 ${username}\n⭐ Your balance: ${balance} stars`,
            { 
                chat_id: chatId, 
                message_id: query.message.message_id, 
                reply_markup: keyboard 
            }
        );
    }
    
    bot.answerCallbackQuery(id);
});

// ==================== STATUS ENDPOINT ====================

app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        activeUsers: userSessions.size,
        totalPayments: userPayments.size,
        botConnected: BOT_TOKEN ? '✅' : '❌',
        timestamp: new Date()
    });
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate session token
 */
function generateSessionToken() {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`\n🚀 ============================================`);
    console.log(`   Diamond SlotBox Server Running`);
    console.log(`============================================`);
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`📱 Bot token: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`💳 Payment provider: ${PAYMENT_PROVIDER_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`============================================\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});
