const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Connect to Local MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/indang_trike_db')
    .then(() => console.log('Connected to MongoDB Database!'))
    .catch(err => console.error(' Database connection error:', err));

// 2. Create the User Database Table (Schema)
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// 3. REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ error: 'Phone number already registered' });

        // Scramble the password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save to Database
        const newUser = new User({ phone, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Find user in database
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ error: 'Account not found' });

        // Check if password matches
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

        res.json({ message: 'Login successful!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. Start Server
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Server running on port ${PORT}`);
});