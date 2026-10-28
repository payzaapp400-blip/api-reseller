const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ============ CONFIG ============
const PORT = process.env.PORT || 3000;
const ORIGINAL_API = 'https://admin.gbssystems.com/public/api/v1/api.php';
const ORIGINAL_KEY = 'FF4KC'; // Tumhara unlimited API key

// ============ FILE PATHS ============
const USERS_FILE = path.join(__dirname, 'users.json');
const USAGE_FILE = path.join(__dirname, 'usage.json');

// ============ DATA LOADING ============
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return { users: {} };
    }
}

function saveUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function loadUsage() {
    try {
        return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveUsage(data) {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

// ============ HELPERS ============
function getToday() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function isExpired(user) {
    if (!user.expiry) return false;
    const today = getToday();
    return user.expiry < today;
}

function getDailyUsage(usage, key) {
    const today = getToday();
    if (!usage[key]) return 0;
    return usage[key][today] || 0;
}

// ============ MAIN PROXY ENDPOINT ============
// User isi link se request karega:
// http://yourserver.com/api.php?key=USER_KEY&cmd=vehicleinfo&query=VEHICLE_NUMBER
app.get('/api.php', async (req, res) => {
    const userKey = req.query.key;
    const cmd = req.query.cmd;
    const query = req.query.query;

    // Validate input
    if (!userKey) {
        return res.json({ success: false, error: 'API key required' });
    }
    if (!query) {
        return res.json({ success: false, error: 'Vehicle number (query) required' });
    }

    // Load data
    const usersData = loadUsers();
    const usageData = loadUsage();

    // Check user exists
    const user = usersData.users[userKey];
    if (!user) {
        return res.json({ success: false, error: 'Invalid API key' });
    }

    // Check user active
    if (user.active === false) {
        return res.json({ success: false, error: 'Account disabled' });
    }

    // Check expiry
    if (isExpired(user)) {
        return res.json({ success: false, error: 'Account expired' });
    }

    // Check daily limit
    const dailyUsage = getDailyUsage(usageData, userKey);
    const dailyLimit = user.dailyLimit || 0;

    if (dailyLimit > 0 && dailyUsage >= dailyLimit) {
        return res.json({
            success: false,
            error: `Daily limit reached (${dailyUsage}/${dailyLimit})`,
            limitReached: true
        });
    }

    // Forward to original API
    try {
        const originalUrl = `${ORIGINAL_API}?key=${ORIGINAL_KEY}&cmd=${cmd || 'vehicleinfo'}&query=${encodeURIComponent(query)}`;
        const response = await fetch(originalUrl);
        const data = await response.json();

        // Increment usage
        const today = getToday();
        if (!usageData[userKey]) usageData[userKey] = {};
        usageData[userKey][today] = (usageData[userKey][today] || 0) + 1;
        saveUsage(usageData);

        // Add usage info to response
        const remaining = dailyLimit > 0 ? dailyLimit - usageData[userKey][today] : 'unlimited';
        data.usage = {
            used: usageData[userKey][today],
            limit: dailyLimit,
            remaining: remaining
        };

        return res.json(data);
    } catch (error) {
        return res.json({ success: false, error: 'Upstream API error: ' + error.message });
    }
});

// ============ ADMIN ENDPOINTS ============
// Admin panel ke liye (password protected simple)

const ADMIN_PASSWORD = 'admin123'; // Isko change karna!

function checkAdmin(req, res, next) {
    const pass = req.query.admin_pass || req.headers['x-admin-pass'];
    if (pass !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// List all users
app.get('/admin/users', checkAdmin, (req, res) => {
    const usersData = loadUsers();
    const usageData = loadUsage();
    const today = getToday();

    const result = Object.entries(usersData.users).map(([key, user]) => ({
        key,
        name: user.name,
        dailyLimit: user.dailyLimit,
        expiry: user.expiry,
        active: user.active !== false,
        todayUsage: getDailyUsage(usageData, key),
        remaining: user.dailyLimit - getDailyUsage(usageData, key)
    }));

    res.json({ success: true, users: result });
});

// Add new user (with trial days support)
app.post('/admin/add-user', checkAdmin, (req, res) => {
    const { name, dailyLimit, expiry, trialDays, key } = req.body;

    if (!name) {
        return res.json({ success: false, error: 'name required' });
    }

    const usersData = loadUsers();

    // Generate key if not provided
    const userKey = key || 'U' + Math.random().toString(36).substring(2, 10).toUpperCase();

    if (usersData.users[userKey]) {
        return res.json({ success: false, error: 'Key already exists' });
    }

    // Calculate expiry from trialDays if provided
    let finalExpiry = expiry || null;
    if (trialDays && !expiry) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + parseInt(trialDays));
        finalExpiry = expDate.toISOString().split('T')[0];
    }

    usersData.users[userKey] = {
        name,
        dailyLimit: dailyLimit ? parseInt(dailyLimit) : 0,
        expiry: finalExpiry,
        active: true,
        createdAt: getToday()
    };

    saveUsers(usersData);

    res.json({
        success: true,
        key: userKey,
        user: usersData.users[userKey],
        link: `http://yourserver.com/api.php?key=${userKey}&cmd=vehicleinfo&query=VEHICLE_NUMBER`
    });
});

// Update user limit
app.post('/admin/update-user', checkAdmin, (req, res) => {
    const { key, dailyLimit, expiry, active } = req.body;

    if (!key) {
        return res.json({ success: false, error: 'key required' });
    }

    const usersData = loadUsers();
    const user = usersData.users[key];

    if (!user) {
        return res.json({ success: false, error: 'User not found' });
    }

    if (dailyLimit !== undefined) user.dailyLimit = parseInt(dailyLimit);
    if (expiry !== undefined) user.expiry = expiry;
    if (active !== undefined) user.active = active;

    saveUsers(usersData);
    res.json({ success: true, user });
});

// Delete user
app.post('/admin/delete-user', checkAdmin, (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.json({ success: false, error: 'key required' });
    }

    const usersData = loadUsers();
    if (!usersData.users[key]) {
        return res.json({ success: false, error: 'User not found' });
    }

    delete usersData.users[key];
    saveUsers(usersData);
    res.json({ success: true, message: 'User deleted' });
});

// Reset today's usage for a user
app.post('/admin/reset-usage', checkAdmin, (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.json({ success: false, error: 'key required' });
    }

    const usageData = loadUsage();
    const today = getToday();

    if (usageData[key]) {
        delete usageData[key][today];
        saveUsage(usageData);
    }

    res.json({ success: true, message: 'Usage reset' });
});

// ============ ADMIN PANEL (HTML) ============
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  API RESELLER SERVER RUNNING');
    console.log('========================================');
    console.log(`  Port: ${PORT}`);
    console.log(`  Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`  API Endpoint: http://localhost:${PORT}/api.php`);
    console.log('========================================');
    console.log('');
});
